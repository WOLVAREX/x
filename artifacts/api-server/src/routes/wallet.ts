import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";
import { db, usersTable, walletTransactionsTable, templatesTable, coinTransactionsTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { COINS_PER_KES } from "../lib/plans";
import crypto from "crypto";

const router: IRouter = Router();
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? "";
const PAYSTACK_BASE = "https://api.paystack.co";
const FRONTEND_URL = process.env.FRONTEND_URL ?? process.env.RENDER_EXTERNAL_URL ?? "http://localhost:5000";

function paystackHeaders() {
  return { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" };
}

function generateReference() {
  return `WALLET-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function formatPhone(phone: string): string {
  let p = phone.trim().replace(/\s+/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("07")) p = "254" + p.slice(1);
  if (p.startsWith("7") && p.length === 9) p = "254" + p;
  if (!p.startsWith("+")) p = "+" + p;
  return p;
}

async function creditWallet(userId: number, amount: number, currency: string, reference: string) {
  if (currency !== "KES") throw new Error("Coin deposits currently require KES");
  // Paystack amounts use minor units: 100 = KES 1.
  const coins = Math.floor(amount * COINS_PER_KES / 100);
  return db.transaction(async (tx) => {
    const [claim] = await tx.update(walletTransactionsTable).set({ status: "success" })
      .where(and(eq(walletTransactionsTable.reference, reference), eq(walletTransactionsTable.status, "pending")))
      .returning({ id: walletTransactionsTable.id });
    if (!claim) {
      const [user] = await tx.select({ coinBalance: usersTable.coinBalance }).from(usersTable).where(eq(usersTable.id, userId));
      return user?.coinBalance ?? 0;
    }
    const [user] = await tx.update(usersTable).set({ coinBalance: sql`${usersTable.coinBalance} + ${coins}` })
      .where(eq(usersTable.id, userId)).returning({ coinBalance: usersTable.coinBalance });
    if (!user) throw new Error("Account not found while crediting coin wallet");
    await tx.insert(coinTransactionsTable).values({ userId, type: "credit", amount: coins, reference: `PAY-${reference}`, description: `KES ${amount / 100} wallet top-up` });
    await tx.update(walletTransactionsTable).set({ balanceAfter: user.coinBalance }).where(eq(walletTransactionsTable.id, claim.id));
    return user.coinBalance;
  });
}

// ── Get wallet balance + transactions ────────────────────
router.get("/wallet", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const [fresh] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  const transactions = await db
    .select()
    .from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.userId, user.id))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(50);
  const coinTransactions = await db.select().from(coinTransactionsTable)
    .where(eq(coinTransactionsTable.userId, user.id))
    .orderBy(desc(coinTransactionsTable.createdAt))
    .limit(50);
  res.json({ balance: fresh?.coinBalance ?? 0, currency: "COIN", transactions, coinTransactions });
});

// ── Initiate card deposit ─────────────────────────────────
router.post("/wallet/deposit/card", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { amount, currency } = req.body;
  if (!Number.isInteger(amount) || amount < 300) { res.status(400).json({ error: "Minimum deposit is KES 3" }); return; }
  if (!PAYSTACK_SECRET) { res.status(500).json({ error: "Payment provider not configured" }); return; }
  if (currency && currency !== "KES") { res.status(400).json({ error: "Coin top-ups are charged in KES" }); return; }

  const reference = generateReference();
  const useCurrency = currency ?? "KES";

  await db.insert(walletTransactionsTable).values({
    userId: user.id, type: "deposit", amount, currency: useCurrency,
    reference, description: "Wallet top-up via card",
    status: "pending", method: "card", balanceAfter: 0,
  });

  try {
    const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST", headers: paystackHeaders(),
      body: JSON.stringify({
        email: user.email, amount, currency: useCurrency, reference,
        channels: ["card"],
        callback_url: `${FRONTEND_URL}/wallet`,
        metadata: { type: "wallet_deposit", userId: user.id },
      }),
    });
    const data = await response.json() as any;
    if (!data.status) { res.status(400).json({ error: data.message ?? "Failed to initialize payment" }); return; }
    res.json({
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
      amount, currency: useCurrency,
    });
  } catch (err) {
    logger.error({ err }, "Wallet deposit card error");
    res.status(500).json({ error: "Payment initialization failed" });
  }
});

// ── Initiate M-Pesa STK push ──────────────────────────────
router.post("/wallet/deposit/mpesa", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { phone, amount } = req.body;
  if (!phone || !Number.isInteger(amount)) { res.status(400).json({ error: "phone and a valid amount are required" }); return; }
  if (amount < 300) { res.status(400).json({ error: "Minimum deposit is KES 3" }); return; }
  if (!PAYSTACK_SECRET) { res.status(500).json({ error: "Payment provider not configured" }); return; }
  const reference = generateReference();
  const formattedPhone = formatPhone(phone);

  await db.insert(walletTransactionsTable).values({
    userId: user.id, type: "deposit", amount, currency: "KES",
    reference, description: "Wallet top-up via M-Pesa",
    status: "pending", method: "mpesa", balanceAfter: 0,
  });

  try {
    const response = await fetch(`${PAYSTACK_BASE}/charge`, {
      method: "POST", headers: paystackHeaders(),
      body: JSON.stringify({
        email: user.email,
        amount,
        currency: "KES",
        reference,
        mobile_money: { phone: formattedPhone, provider: "mpesa" },
        metadata: { type: "wallet_deposit", userId: user.id },
      }),
    });
    const data = await response.json() as any;
    if (!data.status) { res.status(400).json({ error: data.message ?? "STK push failed" }); return; }
    res.json({
      status: data.data?.status ?? "pending",
      reference,
      message: "STK push sent to " + formattedPhone + ". Enter your M-Pesa PIN.",
    });
  } catch (err) {
    logger.error({ err }, "Wallet STK push error");
    res.status(500).json({ error: "STK push failed" });
  }
});

// ── Verify + auto-credit wallet ───────────────────────────
router.get("/wallet/verify/:reference", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const ref = req.params.reference as string;
  if (!PAYSTACK_SECRET) { res.status(500).json({ error: "Payment provider not configured" }); return; }

  // Check if already credited (idempotent)
  const [existing] = await db
    .select()
    .from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.reference, ref));
  if (!existing || existing.userId !== user.id) { res.status(404).json({ error: "Payment reference not found" }); return; }

  if (existing?.status === "success") {
    const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
    res.json({ status: "success", newBalance: freshUser?.coinBalance ?? 0, amount: existing.amount, currency: existing.currency, alreadyCredited: true });
    return;
  }

  try {
    const response = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(ref)}`, {
      headers: paystackHeaders(),
    });
    const data = await response.json() as any;
    if (!data.status || !data.data) { res.status(400).json({ error: data.message ?? "Verification failed" }); return; }
    if (data.data.amount !== existing.amount || data.data.currency !== "KES") { res.status(400).json({ error: "Payment amount or currency does not match this top-up" }); return; }

    const txStatus = data.data.status;

    if (txStatus === "success") {
      const newBalance = await creditWallet(user.id, data.data.amount, data.data.currency, ref);
      res.json({ status: "success", newBalance, amount: data.data.amount, currency: data.data.currency });
    } else if (txStatus === "failed") {
      await db.update(walletTransactionsTable).set({ status: "failed" }).where(eq(walletTransactionsTable.reference, ref));
      res.json({ status: "failed" });
    } else {
      res.json({ status: txStatus }); // pending/processing
    }
  } catch (err) {
    logger.error({ err }, "Wallet verify error");
    res.status(500).json({ error: "Verification failed" });
  }
});

// ── Paystack Webhook (auto-credit on charge.success) ─────
router.post("/wallet/webhook", async (req, res): Promise<void> => {
  // Verify HMAC signature
  const signature = req.headers["x-paystack-signature"] as string;
  if (!PAYSTACK_SECRET || !signature) {
    res.sendStatus(400);
    return;
  }
  const hash = crypto.createHmac("sha512", PAYSTACK_SECRET).update(JSON.stringify(req.body)).digest("hex");
  if (hash !== signature) {
    logger.warn("Invalid Paystack webhook signature");
    res.sendStatus(400);
    return;
  }

  const event = req.body as any;
  logger.info({ event: event.event }, "Paystack webhook received");

  if (event.event === "charge.success") {
    const reference = event.data?.reference as string;
    const metadata = event.data?.metadata;
    const amount = event.data?.amount as number;
    const currency = event.data?.currency as string;

    if (reference && metadata?.type === "wallet_deposit") {
      const userId = metadata.userId as number;

      // Check not already credited
      const [tx] = await db
        .select()
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.reference, reference));

      if (tx && tx.userId === userId && tx.status !== "success" && tx.amount === amount && tx.currency === currency) {
        await creditWallet(userId, amount, currency, reference);
        logger.info({ userId, amount, reference }, "Wallet auto-credited via webhook");
      }
    }
  }

  res.sendStatus(200);
});

// ── Can deploy check ─────────────────────────────────────
router.get("/wallet/can-deploy/:templateId", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const templateId = parseInt(req.params.templateId as string, 10);
  const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, templateId));
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  if (template.isFree || user.role === "admin") { res.json({ canDeploy: true, isFree: true, balance: user.walletBalance }); return; }
  const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  const balance = freshUser?.walletBalance ?? 0;
  const canDeploy = balance >= template.price;
  res.json({ canDeploy, isFree: false, balance, required: template.price, shortfall: canDeploy ? 0 : template.price - balance, currency: template.currency });
});

// ── Deduct from wallet ───────────────────────────────────
router.post("/wallet/deduct", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { templateId, description } = req.body;
  const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, templateId));
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  if (template.isFree || user.role === "admin") { res.json({ success: true, isFree: true }); return; }
  const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  const balance = freshUser?.walletBalance ?? 0;
  if (balance < template.price) {
    res.status(402).json({ error: "Insufficient wallet balance", balance, required: template.price, shortfall: template.price - balance });
    return;
  }
  const newBalance = balance - template.price;
  await db.update(usersTable).set({ walletBalance: newBalance }).where(eq(usersTable.id, user.id));
  await db.insert(walletTransactionsTable).values({
    userId: user.id, type: "deduction", amount: template.price,
    currency: template.currency, description: description ?? `Deployed bot: ${template.name}`,
    status: "success", method: null, balanceAfter: newBalance,
  });
  res.json({ success: true, newBalance, deducted: template.price });
});

export default router;
