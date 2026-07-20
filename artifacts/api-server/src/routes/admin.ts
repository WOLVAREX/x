import { Router, type IRouter } from "express";
import { db, deploymentsTable, templatesTable, usersTable, paymentsTable, walletTransactionsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { logger } from "../lib/logger";
import { getSetting, setSetting } from "../lib/settings";

const router: IRouter = Router();
const HEROKU_BASE = "https://api.heroku.com";

async function herokuHeaders() {
  const key = await getSetting("HEROKU_API_KEY");
  return { Authorization: `Bearer ${key}`, Accept: "application/vnd.heroku+json; version=3", "Content-Type": "application/json" };
}

function formatTemplate(t: typeof templatesTable.$inferSelect) {
  return {
    id: t.id, name: t.name, description: t.description,
    githubRepo: t.githubRepo, thumbnail: t.thumbnail ?? null,
    category: t.category, appJson: t.appJson,
    isFree: t.isFree ?? false, price: t.price ?? 0,
    currency: t.currency ?? "KES", pairSiteUrl: t.pairSiteUrl ?? null,
    createdAt: t.createdAt,
  };
}

// â”€â”€ Stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/admin/stats", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable);
  const deployments = await db.select().from(deploymentsTable);
  const templates = await db.select().from(templatesTable);
  const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.status, "success"));
  const onlineDeployments = deployments.filter(d => d.status === "online").length;
  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
  res.json({
    totalUsers: users.length,
    suspendedUsers: users.filter(u => u.suspended).length,
    totalDeployments: deployments.length,
    onlineDeployments,
    errorDeployments: deployments.filter(d => d.status === "error").length,
    totalTemplates: templates.length,
    totalRevenue, totalPayments: payments.length,
  });
});

// â”€â”€ List users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/admin/users", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(users.map(u => ({
    id: u.id, username: u.username, email: u.email,
    role: u.role, suspended: u.suspended ?? false,
    walletBalance: u.walletBalance ?? 0, createdAt: u.createdAt,
  })));
});

// â”€â”€ Suspend user â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post("/admin/users/:id/suspend", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [user] = await db.update(usersTable).set({ suspended: true }).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Also suspend all their Heroku deployments
  const deployments = await db.select().from(deploymentsTable).where(eq(deploymentsTable.userId, id));
  for (const dep of deployments) {
    if (dep.herokuAppId && await getSetting("HEROKU_API_KEY")) {
      await fetch(`${HEROKU_BASE}/apps/${dep.herokuAppId}/formation`, {
        method: "PATCH", headers: await herokuHeaders(),
        body: JSON.stringify({ updates: [{ type: "worker", quantity: 0 }] }),
      }).catch(() => {});
    }
    await db.update(deploymentsTable).set({ status: "suspended" }).where(eq(deploymentsTable.id, dep.id));
  }

  res.json({ id: user.id, username: user.username, suspended: true, message: "User suspended and all bots stopped" });
});

// â”€â”€ Unsuspend user â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post("/admin/users/:id/unsuspend", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [user] = await db.update(usersTable).set({ suspended: false }).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ id: user.id, username: user.username, suspended: false, message: "User unsuspended" });
});

// â”€â”€ Delete user â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.delete("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Delete all their Heroku apps first
  const deployments = await db.select().from(deploymentsTable).where(eq(deploymentsTable.userId, id));
  for (const dep of deployments) {
    if (dep.herokuAppId && await getSetting("HEROKU_API_KEY")) {
      await fetch(`${HEROKU_BASE}/apps/${dep.herokuAppId}`, {
        method: "DELETE", headers: await herokuHeaders(),
      }).catch(() => {});
    }
  }

  // Delete user (cascades to deployments, payments, wallet)
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

// â”€â”€ List deployments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/admin/deployments", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({ deployment: deploymentsTable, templateName: templatesTable.name, username: usersTable.username })
    .from(deploymentsTable)
    .leftJoin(templatesTable, eq(deploymentsTable.templateId, templatesTable.id))
    .leftJoin(usersTable, eq(deploymentsTable.userId, usersTable.id))
    .orderBy(desc(deploymentsTable.createdAt));
  res.json(rows.map(r => ({
    id: r.deployment.id, userId: r.deployment.userId, templateId: r.deployment.templateId,
    templateName: r.templateName ?? "Unknown", username: r.username ?? "Unknown",
    botName: r.deployment.botName, herokuAppId: r.deployment.herokuAppId ?? null,
    status: r.deployment.status, createdAt: r.deployment.createdAt, updatedAt: r.deployment.updatedAt,
  })));
});

// â”€â”€ Suspend bot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post("/admin/deployments/:id/suspend", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, id));
  if (!dep) { res.status(404).json({ error: "Not found" }); return; }

  if (dep.herokuAppId && await getSetting("HEROKU_API_KEY")) {
    await fetch(`${HEROKU_BASE}/apps/${dep.herokuAppId}/formation`, {
      method: "PATCH", headers: await herokuHeaders(),
      body: JSON.stringify({ updates: [{ type: "worker", quantity: 0 }] }),
    }).catch(() => {});
  }

  const logs = (dep.logs as string[]) ?? [];
  const [updated] = await db.update(deploymentsTable)
    .set({ status: "suspended", logs: [...logs, `[${new Date().toISOString()}] Suspended by admin`] })
    .where(eq(deploymentsTable.id, id)).returning();
  res.json({ id: updated.id, status: updated.status, botName: updated.botName });
});

// â”€â”€ Admin delete bot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.delete("/admin/deployments/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, id));
  if (!dep) { res.status(404).json({ error: "Not found" }); return; }

  if (dep.herokuAppId && await getSetting("HEROKU_API_KEY")) {
    await fetch(`${HEROKU_BASE}/apps/${dep.herokuAppId}`, {
      method: "DELETE", headers: await herokuHeaders(),
    }).catch(() => {});
  }

  await db.delete(deploymentsTable).where(eq(deploymentsTable.id, id));
  res.sendStatus(204);
});

// â”€â”€ Admin view bot logs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/admin/deployments/:id/logs", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, id));
  if (!dep) { res.status(404).json({ error: "Not found" }); return; }

  let lines = (dep.logs as string[]) ?? [];

  // Fetch live Heroku logs too
  if (dep.herokuAppId && await getSetting("HEROKU_API_KEY")) {
    try {
      const sessionRes = await fetch(`${HEROKU_BASE}/apps/${dep.herokuAppId}/log-sessions`, {
        method: "POST", headers: await herokuHeaders(),
        body: JSON.stringify({ lines: 100, tail: false }),
      });
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json() as any;
        const logsRes = await fetch(sessionData.logplex_url);
        const logsText = await logsRes.text();
        const herokuLines = logsText.split("\n").filter(Boolean);
        lines = [...lines, "", "-- Live Heroku Logs --", ...herokuLines];
      }
    } catch {}
  }

  res.json({ lines, status: dep.status, botName: dep.botName, herokuAppId: dep.herokuAppId });
});

// â”€â”€ Platform Health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/admin/health", requireAdmin, async (_req, res): Promise<void> => {
  const deployments = await db.select().from(deploymentsTable);
  const users = await db.select().from(usersTable);
  const payments = await db.select().from(paymentsTable);
  const walletTx = await db.select().from(walletTransactionsTable);

  const onlineCount = deployments.filter(d => d.status === "online").length;
  const offlineCount = deployments.filter(d => d.status === "offline").length;
  const errorCount = deployments.filter(d => d.status === "error").length;
  const buildingCount = deployments.filter(d => d.status === "building").length;
  const suspendedCount = deployments.filter(d => d.status === "suspended").length;

  const totalRevenue = payments.filter(p => p.status === "success").reduce((s, p) => s + p.amount, 0);
  const pendingPayments = payments.filter(p => p.status === "pending").length;
  const totalWalletBalance = users.reduce((s, u) => s + (u.walletBalance ?? 0), 0);

  // Uptime rate
  const uptimeRate = deployments.length > 0 ? Math.round((onlineCount / deployments.length) * 100) : 100;

  // Heroku connectivity check
  let herokuStatus = "not_configured";
  const herokuKey = await getSetting("HEROKU_API_KEY");
  if (herokuKey) {
    try {
      const r = await fetch(`${HEROKU_BASE}/account`, { headers: await herokuHeaders() });
      herokuStatus = r.ok ? "connected" : "error";
    } catch { herokuStatus = "error"; }
  }

  res.json({
    bots: { total: deployments.length, online: onlineCount, offline: offlineCount, error: errorCount, building: buildingCount, suspended: suspendedCount, uptimeRate },
    users: { total: users.length, suspended: users.filter(u => u.suspended).length },
    payments: { totalRevenue, pendingPayments, totalTransactions: payments.length, totalWalletBalance },
    integrations: { heroku: herokuStatus, database: "connected" },
    timestamp: new Date().toISOString(),
  });
});

// â”€â”€ Edit template â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch("/admin/templates/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, description, githubRepo, thumbnail, category, appJson, isFree, price, currency, pairSiteUrl } = req.body;
  const [template] = await db.update(templatesTable).set({
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(githubRepo !== undefined && { githubRepo }),
    ...(thumbnail !== undefined && { thumbnail }),
    ...(category !== undefined && { category }),
    ...(appJson !== undefined && { appJson }),
    ...(isFree !== undefined && { isFree }),
    ...(price !== undefined && { price: isFree ? 0 : price }),
    ...(currency !== undefined && { currency }),
    ...(pairSiteUrl !== undefined && { pairSiteUrl }),
  }).where(eq(templatesTable.id, id)).returning();
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(formatTemplate(template));
});

// â”€â”€ Fetch app.json â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post("/admin/fetch-app-json", requireAdmin, async (req, res): Promise<void> => {
  const { repoUrl } = req.body;
  if (!repoUrl) { res.status(400).json({ error: "repoUrl is required" }); return; }
  try {
    const cleaned = repoUrl.replace(/\.git$/, "").trim();
    const match = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) { res.status(400).json({ error: "Must be a valid GitHub repository URL" }); return; }
    const [, owner, repo] = match;
    let appJson: Record<string, unknown> | null = null;
    for (const branch of ["main", "master"]) {
      try {
        const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/app.json`);
        if (r.ok) { appJson = await r.json() as Record<string, unknown>; break; }
      } catch { continue; }
    }
    if (!appJson) { res.status(400).json({ error: "Could not find app.json" }); return; }
    res.json({
      name: (appJson.name as string | undefined) ?? repo,
      description: (appJson.description as string | undefined) ?? null,
      logo: (appJson.logo as string | undefined) ?? null,
      keywords: (appJson.keywords as string[] | undefined) ?? [],
      env: (appJson.env as Record<string, unknown> | undefined) ?? {},
      raw: appJson,
    });
  } catch (err) {
    logger.error({ err }, "fetch-app-json error");
    res.status(500).json({ error: "Failed to fetch app.json" });
  }
});

router.get("/admin/payments", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({ payment: paymentsTable, templateName: templatesTable.name, username: usersTable.username, email: usersTable.email })
    .from(paymentsTable)
    .leftJoin(templatesTable, eq(paymentsTable.templateId, templatesTable.id))
    .leftJoin(usersTable, eq(paymentsTable.userId, usersTable.id))
    .orderBy(desc(paymentsTable.createdAt));
  res.json(rows.map(r => ({ ...r.payment, templateName: r.templateName ?? "Unknown", username: r.username ?? "Unknown", email: r.email ?? "Unknown" })));
});

// ── Heroku key settings ───────────────────────────────────────────────────
router.get("/admin/settings/heroku", requireAdmin, async (_req, res): Promise<void> => {
  const key = await getSetting("HEROKU_API_KEY");
  // Never expose the full key — only whether one exists, and the last 4 chars
  if (!key) {
    res.json({ configured: false, preview: null });
    return;
  }
  res.json({ configured: true, preview: `••••••••${key.slice(-4)}` });
});

router.post("/admin/settings/heroku", requireAdmin, async (req, res): Promise<void> => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
    res.status(400).json({ error: "A valid Heroku API key is required" });
    return;
  }

  // Validate it against Heroku before saving
  const testRes = await fetch(`${HEROKU_BASE}/account`, {
    headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: "application/vnd.heroku+json; version=3" },
  });
  if (!testRes.ok) {
    res.status(400).json({ error: "Heroku rejected the key — double-check it and try again" });
    return;
  }

  await setSetting("HEROKU_API_KEY", apiKey.trim());
  res.json({ success: true, preview: `••••••••${apiKey.trim().slice(-4)}` });
});

export default router;
