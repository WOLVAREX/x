import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";
import { db, paymentsTable, templatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? "";
const PAYSTACK_BASE = "https://api.paystack.co";

function paystackHeaders() {
  return {
    Authorization: `Bearer ${PAYSTACK_SECRET}`,
    "Content-Type": "application/json",
  };
}

function generateReference() {
  return `JUNEX-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

// ── Check if user has paid for a template ─────────────────────
router.get("/payments/check/:templateId", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const templateId = parseInt(req.params.templateId as string, 10);
  if (isNaN(templateId)) { res.status(400).json({ error: "Invalid templateId" }); return; }

  // Check if template is free
  const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, templateId));
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  if (template.isFree) { res.json({ paid: true, isFree: true }); return; }

  // Check payments table
  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.userId, user.id), eq(paymentsTable.templateId, templateId), eq(paymentsTable.status, "success")));

  res.json({ paid: !!payment, isFree: false, payment: payment ?? null });
});

// ── Initiate card payment ──────────────────────────────────────
router.post("/payments/initiate", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { templateId, currency, callbackUrl } = req.body;

  if (!templateId) { res.status(400).json({ error: "templateId is required" }); return; }
  if (!PAYSTACK_SECRET) { res.status(500).json({ error: "Payment provider not configured. Add PAYSTACK_SECRET_KEY." }); return; }

  const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, parseInt(templateId, 10)));
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  if (template.isFree) { res.json({ isFree: true }); return; }

  const reference = generateReference();
  const useCurrency = currency ?? template.currency ?? "KES";

  // Record pending payment
  await db.insert(paymentsTable).values({
    userId: user.id,
    templateId: template.id,
    reference,
    amount: template.price,
    currency: useCurrency,
    status: "pending",
    method: "card",
  });

  try {
    const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: paystackHeaders(),
      body: JSON.stringify({
        email: user.email,
        amount: template.price,     // already in kobo/cents
        currency: useCurrency,
        reference,
        callback_url: callbackUrl ?? `${process.env.FRONTEND_URL ?? process.env.RENDER_EXTERNAL_URL ?? "http://localhost:5000"}/payment-callback`,
        metadata: { templateId: template.id, templateName: template.name },
      }),
    });
    const data = await response.json() as any;
    if (!data.status || !data.data) {
      res.status(400).json({ error: data.message ?? "Failed to initialize payment" });
      return;
    }
    res.json({
      authorizationUrl: data.data.authorization_url,
      reference: data.data.reference,
      accessCode: data.data.access_code,
      amount: template.price,
      currency: useCurrency,
      templateName: template.name,
    });
  } catch (err) {
    logger.error({ err }, "Paystack initiate error");
    res.status(500).json({ error: "Payment initialization failed" });
  }
});

// ── STK Push (M-Pesa) ─────────────────────────────────────────
router.post("/payments/stk-push", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { phone, templateId } = req.body;

  if (!phone || !templateId) { res.status(400).json({ error: "phone and templateId are required" }); return; }
  if (!PAYSTACK_SECRET) { res.status(500).json({ error: "Payment provider not configured." }); return; }

  const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, parseInt(templateId, 10)));
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  if (template.isFree) { res.json({ isFree: true }); return; }

  const reference = generateReference();
  const normalizedPhone = phone.startsWith("+") ? phone.slice(1) : phone;

  // Record pending payment
  await db.insert(paymentsTable).values({
    userId: user.id,
    templateId: template.id,
    reference,
    amount: template.price,
    currency: "KES",
    status: "pending",
    method: "mpesa",
  });

  try {
    const response = await fetch(`${PAYSTACK_BASE}/charge`, {
      method: "POST",
      headers: paystackHeaders(),
      body: JSON.stringify({
        email: user.email,
        amount: template.price,
        currency: "KES",
        reference,
        mobile_money: { phone: normalizedPhone, provider: "mpesa" },
        metadata: { templateId: template.id, templateName: template.name },
      }),
    });
    const data = await response.json() as any;
    if (!data.status) {
      res.status(400).json({ error: data.message ?? "STK push failed" });
      return;
    }
    res.json({
      status: data.data?.status ?? "pending",
      reference: data.data?.reference ?? reference,
      message: "STK push sent. Check your phone and enter your M-Pesa PIN.",
    });
  } catch (err) {
    logger.error({ err }, "Paystack STK push error");
    res.status(500).json({ error: "STK push failed" });
  }
});

// ── Verify payment + unlock deployment ───────────────────────
router.get("/payments/verify/:reference", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const raw = Array.isArray(req.params.reference) ? req.params.reference[0] : req.params.reference;
  if (!raw) { res.status(400).json({ error: "Reference is required" }); return; }
  if (!PAYSTACK_SECRET) { res.status(500).json({ error: "Payment provider not configured." }); return; }

  try {
    const response = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(raw)}`, {
      headers: paystackHeaders(),
    });
    const data = await response.json() as any;
    if (!data.status || !data.data) {
      res.status(400).json({ error: data.message ?? "Verification failed" });
      return;
    }

    const txStatus = data.data.status; // "success" | "failed" | "pending"

    // Update our payments record
    if (txStatus === "success") {
      await db
        .update(paymentsTable)
        .set({ status: "success", paidAt: new Date() })
        .where(eq(paymentsTable.reference, raw));
    } else if (txStatus === "failed") {
      await db
        .update(paymentsTable)
        .set({ status: "failed" })
        .where(eq(paymentsTable.reference, raw));
    }

    res.json({
      status: txStatus,
      reference: data.data.reference,
      amount: data.data.amount,
      currency: data.data.currency,
      paidAt: data.data.paid_at ?? null,
      unlocked: txStatus === "success",
    });
  } catch (err) {
    logger.error({ err }, "Paystack verify error");
    res.status(500).json({ error: "Payment verification failed" });
  }
});

// ── Paystack Webhook ──────────────────────────────────────────
router.post("/payments/webhook", async (req, res): Promise<void> => {
  const hash = req.headers["x-paystack-signature"];
  // In production verify HMAC-SHA512 signature here
  const event = req.body as any;

  if (event.event === "charge.success") {
    const reference = event.data?.reference;
    if (reference) {
      await db
        .update(paymentsTable)
        .set({ status: "success", paidAt: new Date() })
        .where(eq(paymentsTable.reference, reference));
    }
  }

  res.sendStatus(200);
});

// ── List user payments ────────────────────────────────────────
router.get("/payments/my", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const rows = await db
    .select({ payment: paymentsTable, templateName: templatesTable.name })
    .from(paymentsTable)
    .leftJoin(templatesTable, eq(paymentsTable.templateId, templatesTable.id))
    .where(eq(paymentsTable.userId, user.id));

  res.json(rows.map(r => ({
    ...r.payment,
    templateName: r.templateName ?? "Unknown",
  })));
});

export default router;
