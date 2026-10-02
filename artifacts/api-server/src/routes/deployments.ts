import { Router, type IRouter } from "express";
import { db, deploymentsTable, templatesTable, usersTable, coinTransactionsTable } from "@workspace/db";
import { eq, and, isNull, isNotNull, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";
import { getSetting } from "../lib/settings";
import { findPlan } from "../lib/plans";

const router: IRouter = Router();

const HEROKU_BASE = "https://api.heroku.com";

async function getHerokuKey(): Promise<string> {
  return (await getSetting("HEROKU_TEAM_API_KEY")) || (await getSetting("HEROKU_API_KEY"));
}

async function getHerokuTeam(): Promise<string> {
  return getSetting("HEROKU_TEAM_NAME");
}

async function herokuHeaders(accept = "application/vnd.heroku+json; version=3") {
  return {
    Authorization: `Bearer ${await getHerokuKey()}`,
    Accept: accept,
    "Content-Type": "application/json",
  };
}

async function stopHerokuDynos(appName: string): Promise<void> {
  const response = await fetch(`${HEROKU_BASE}/apps/${appName}/formation`, { headers: await herokuHeaders() });
  if (!response.ok) throw new Error("Could not read Heroku dyno formation");
  const formations = await response.json() as Array<{ type: string; quantity: number }>;
  const updates = formations.filter((formation) => formation.quantity > 0).map(({ type }) => ({ type, quantity: 0 }));
  if (updates.length) {
    const stopped = await fetch(`${HEROKU_BASE}/apps/${appName}/formation`, { method: "PATCH", headers: await herokuHeaders(), body: JSON.stringify({ updates }) });
    if (!stopped.ok) throw new Error("Could not stop Heroku dynos");
  }
}

function ts() {
  return `[${new Date().toISOString()}]`;
}

function sanitizeAppName(name: string, id: number): string {
  return `jxhp-${id}-${name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 20)}`;
}

function formatDeployment(d: typeof deploymentsTable.$inferSelect, templateName: string, templateThumbnail?: string | null) {
  return {
    id: d.id,
    userId: d.userId,
    templateId: d.templateId,
    templateName,
    templateThumbnail: templateThumbnail ?? null,
    botName: d.botName,
    herokuAppId: d.herokuAppId ?? null,
    appName: d.herokuAppId ?? null,
    status: d.status,
    planId: d.planId ?? null,
    expiresAt: d.expiresAt ?? null,
    daysLeft: d.expiresAt ? Math.max(0, Math.ceil((d.expiresAt.getTime() - Date.now()) / 86_400_000)) : null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

async function appendLog(deploymentId: number, line: string) {
  const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));
  if (!dep) return;
  const existing = (dep.logs as string[]) ?? [];
  await db.update(deploymentsTable)
    .set({ logs: [...existing, `${ts()} ${line}`] })
    .where(eq(deploymentsTable.id, deploymentId));
}

async function herokuDeploy(deploymentId: number, template: typeof templatesTable.$inferSelect, botName: string, envVars: Record<string, string>) {
  const appName = sanitizeAppName(botName, deploymentId);

  try {
    // ── Step 1: Create Heroku app ────────────────────────────
    await appendLog(deploymentId, "Initializing deployment...");
    await appendLog(deploymentId, `Creating Heroku app: ${appName}`);

    const teamName = await getHerokuTeam();
    const createRes = await fetch(`${HEROKU_BASE}${teamName ? "/teams/apps" : "/apps"}`, {
      method: "POST",
      headers: await herokuHeaders(),
      body: JSON.stringify({ name: appName, stack: "heroku-22", ...(teamName ? { team: teamName } : {}) }),
    });
    const createData = await createRes.json() as any;

    if (!createRes.ok) {
      const msg = createData.message ?? "Failed to create Heroku app";
      await appendLog(deploymentId, `ERROR: ${msg}`);
      await db.update(deploymentsTable).set({ status: "error" }).where(eq(deploymentsTable.id, deploymentId));
      return;
    }

    await appendLog(deploymentId, `App created: ${createData.name}.herokuapp.com`);

    // Save herokuAppId immediately
    await db.update(deploymentsTable)
      .set({ herokuAppId: createData.name })
      .where(eq(deploymentsTable.id, deploymentId));

    // ── Step 2: Set environment variables ───────────────────
    await appendLog(deploymentId, "Configuring environment variables...");

    const configVars: Record<string, string> = { ...envVars };
    const appJsonEnv = (template.appJson as any)?.env ?? {};

    // Merge any defaults from app.json
    for (const [key, val] of Object.entries(appJsonEnv)) {
      if (!(key in configVars) && typeof (val as any).value === "string") {
        configVars[key] = (val as any).value;
      }
    }

    // Stable platform metadata lets templates display J.H.P as their host brand.
    configVars.JHP_PLATFORM = "J.H.P";
    configVars.JHP_PLATFORM_URL = "https://host.junex.space";

    if (Object.keys(configVars).length > 0) {
      const configRes = await fetch(`${HEROKU_BASE}/apps/${appName}/config-vars`, {
        method: "PATCH",
        headers: await herokuHeaders(),
        body: JSON.stringify(configVars),
      });
      if (!configRes.ok) {
        const configData = await configRes.json() as any;
        await appendLog(deploymentId, `WARNING: Config vars partially set — ${configData.message ?? "unknown error"}`);
      } else {
        await appendLog(deploymentId, `${Object.keys(configVars).length} environment variable(s) configured`);
      }
    }

    // ── Step 3: Connect GitHub repo and create build ─────────
    await appendLog(deploymentId, `Fetching source from ${template.githubRepo}...`);

    // Get latest tarball from GitHub
    const repoUrl = template.githubRepo.replace(/\.git$/, "").trim();
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      await appendLog(deploymentId, "ERROR: Invalid GitHub repo URL in template");
      await db.update(deploymentsTable).set({ status: "error" }).where(eq(deploymentsTable.id, deploymentId));
      return;
    }
    const [, owner, repo] = match;

    // Try main then master
    let tarballUrl = "";
    for (const branch of ["main", "master"]) {
      const testRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/tarball/${branch}`, { method: "HEAD" });
      if (testRes.ok || testRes.status === 302) {
        tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball/${branch}`;
        await appendLog(deploymentId, `Source branch: ${branch}`);
        break;
      }
    }

    if (!tarballUrl) {
      await appendLog(deploymentId, "ERROR: Could not find source branch (tried main, master)");
      await db.update(deploymentsTable).set({ status: "error" }).where(eq(deploymentsTable.id, deploymentId));
      return;
    }

    // ── Step 4: Create build from tarball ───────────────────
    await appendLog(deploymentId, "Starting build on Heroku...");

    const buildRes = await fetch(`${HEROKU_BASE}/apps/${appName}/builds`, {
      method: "POST",
      headers: await herokuHeaders(),
      body: JSON.stringify({
        source_blob: { url: tarballUrl, version: "HEAD" },
      }),
    });
    const buildData = await buildRes.json() as any;

    if (!buildRes.ok) {
      await appendLog(deploymentId, `ERROR: Build failed to start — ${buildData.message ?? "unknown"}`);
      await db.update(deploymentsTable).set({ status: "error" }).where(eq(deploymentsTable.id, deploymentId));
      return;
    }

    const buildId = buildData.id as string;
    await appendLog(deploymentId, `Build started (ID: ${buildId})`);
    await appendLog(deploymentId, "Compiling dependencies...");

    // ── Step 5: Poll build status ────────────────────────────
    let buildStatus = "pending";
    let attempts = 0;
    const maxAttempts = 60; // 5 min timeout

    while (["pending", "queued", "processing"].includes(buildStatus) && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 5000));
      attempts++;

      const [current] = await db.select({ status: deploymentsTable.status, archivedAt: deploymentsTable.archivedAt })
        .from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));
      if (!current || current.archivedAt || current.status === "online") return;

      const statusRes = await fetch(`${HEROKU_BASE}/apps/${appName}/builds/${buildId}`, {
        headers: await herokuHeaders(),
        signal: AbortSignal.timeout(15_000),
      });
      if (!statusRes.ok) {
        const errorBody = await statusRes.json().catch(() => ({})) as any;
        await appendLog(deploymentId, `Heroku build status check failed (${statusRes.status}): ${errorBody.message ?? "retrying"}`);
        continue;
      }
      const statusData = await statusRes.json() as any;
      buildStatus = typeof statusData.status === "string" ? statusData.status.toLowerCase() : "pending";

      if (attempts % 3 === 0) {
        await appendLog(deploymentId, `Heroku build ${buildStatus} (${attempts * 5}s elapsed)`);
      }
    }

    if (buildStatus !== "succeeded") {
      await appendLog(deploymentId, `ERROR: Build ${buildStatus} after ${attempts * 5}s`);
      await appendLog(deploymentId, "Check your app.json and repository for errors");
      await db.update(deploymentsTable).set({ status: "error" }).where(eq(deploymentsTable.id, deploymentId));
      return;
    }

    await appendLog(deploymentId, "Build succeeded!");

    // ── Step 6: Scale dynos (start the bot) ─────────────────
    await appendLog(deploymentId, "Starting bot dyno...");

    const scaleRes = await fetch(`${HEROKU_BASE}/apps/${appName}/formation`, {
      method: "PATCH",
      headers: await herokuHeaders(),
      body: JSON.stringify({ updates: [{ type: "worker", quantity: 1, size: "eco" }] }),
    });

    if (!scaleRes.ok) {
      // Try web dyno as fallback
      const scaleRes2 = await fetch(`${HEROKU_BASE}/apps/${appName}/formation`, {
        method: "PATCH",
        headers: await herokuHeaders(),
        body: JSON.stringify({ updates: [{ type: "web", quantity: 1, size: "eco" }] }),
      });
      if (!scaleRes2.ok) {
        await appendLog(deploymentId, "WARNING: Could not scale dyno automatically. Start manually from dashboard.");
      } else {
        await appendLog(deploymentId, "Web dyno started (1x eco)");
      }
    } else {
      await appendLog(deploymentId, "Worker dyno started (1x eco)");
    }

    // ── Step 7: Mark as online ───────────────────────────────
    await appendLog(deploymentId, "");
    await appendLog(deploymentId, "Deployment successful!");
    await appendLog(deploymentId, `Your bot is live at: https://${appName}.herokuapp.com`);
    await appendLog(deploymentId, "Redirecting to your bots...");

    await db.update(deploymentsTable)
      .set({ status: "online", herokuAppId: appName })
      .where(eq(deploymentsTable.id, deploymentId));

  } catch (err) {
    logger.error({ err }, "Heroku deploy error");
    await appendLog(deploymentId, `FATAL ERROR: ${(err as Error).message}`);
    await db.update(deploymentsTable).set({ status: "error" }).where(eq(deploymentsTable.id, deploymentId));
  }
}

// ── Routes ────────────────────────────────────────────────

router.get("/deployments", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const user = (req as any).user;
  const rows = await db
    .select({ deployment: deploymentsTable, templateName: templatesTable.name, templateThumbnail: templatesTable.thumbnail })
    .from(deploymentsTable)
    .leftJoin(templatesTable, eq(deploymentsTable.templateId, templatesTable.id))
    .where(and(eq(deploymentsTable.userId, user.id), isNull(deploymentsTable.archivedAt)))
    .orderBy(deploymentsTable.createdAt);
  res.json(rows.map(r => formatDeployment(r.deployment, r.templateName ?? "Unknown", r.templateThumbnail)));
});

router.post("/deployments", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { templateId, envVars, planId } = req.body;
  const botName = typeof req.body?.botName === "string" ? req.body.botName.trim() : "";

  if (!templateId || !botName || botName.length > 60 || /[\u0000-\u001f\u007f]/.test(botName)) {
    res.status(400).json({ error: "templateId and botName are required" });
    return;
  }
  const normalizedBotName = botName.toLowerCase();

  if (!(await getHerokuKey())) {
    res.status(500).json({ error: "Heroku API key not configured. Add HEROKU_API_KEY to .env" });
    return;
  }

  const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, templateId));
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  const plan = await findPlan(planId);
  if (!plan) { res.status(400).json({ error: "Select a valid hosting plan" }); return; }
  if (user.suspended) { res.status(403).json({ error: "Your account has been suspended. Contact support." }); return; }

  const expiresAt = new Date(Date.now() + plan.days * 86_400_000);
  const result = await db.transaction(async (tx) => {
    // Serialize same-account name checks to keep names unique under concurrent deploy requests.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${user.id}, hashtext(${normalizedBotName}))`);
    const [existingName] = await tx.select({ id: deploymentsTable.id }).from(deploymentsTable)
      .where(and(eq(deploymentsTable.userId, user.id), sql`lower(trim(${deploymentsTable.botName})) = ${normalizedBotName}`)).limit(1);
    if (existingName) return { duplicateName: true as const };

    if (user.role !== "admin") {
      const [updatedUser] = await tx.update(usersTable)
        .set({ coinBalance: sql`${usersTable.coinBalance} - ${plan.coins}` })
        .where(and(eq(usersTable.id, user.id), gte(usersTable.coinBalance, plan.coins)))
        .returning({ coinBalance: usersTable.coinBalance });
      if (!updatedUser) return null;
    }
    const [deployment] = await tx.insert(deploymentsTable).values({
      userId: user.id, templateId, botName, planId: plan.id, expiresAt,
      status: "building", envVars: envVars ?? {},
      logs: [`${ts()} Deployment request received`, `${ts()} Template: ${template.name}`, `${ts()} Bot name: ${botName}`, `${ts()} Hosting plan: ${plan.name}`],
    }).returning();
    if (user.role !== "admin") {
      await tx.insert(coinTransactionsTable).values({ userId: user.id, type: "debit", amount: plan.coins, reference: `DEPLOY-${deployment.id}`, description: `${plan.name} hosting plan for ${botName}` });
    }
    return { deployment };
  });
  if (!result) {
    res.status(402).json({ error: "Not enough coins for this plan", requiredCoins: plan.coins, balance: user.coinBalance });
    return;
  }
  if ("duplicateName" in result) {
    res.status(409).json({ error: "You already have a bot with this name. Choose a unique name for your account." });
    return;
  }
  const deployment = result.deployment;

  // Return immediately — deploy runs in background
  res.status(201).json(formatDeployment(deployment, template.name, template.thumbnail));

  // Fire and forget
  herokuDeploy(deployment.id, template, botName, envVars ?? {}).catch(err => {
    logger.error({ err }, "Background deploy failed");
  });
});

router.get("/deployments/:id", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select({ deployment: deploymentsTable, templateName: templatesTable.name, templateThumbnail: templatesTable.thumbnail })
    .from(deploymentsTable)
    .leftJoin(templatesTable, eq(deploymentsTable.templateId, templatesTable.id))
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id), isNull(deploymentsTable.archivedAt)));

  if (!row) { res.status(404).json({ error: "Deployment not found" }); return; }
  res.json(formatDeployment(row.deployment, row.templateName ?? "Unknown", row.templateThumbnail));
});

router.get("/deployments/:id/logs", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const user = (req as any).user;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deployment] = await db
    .select()
    .from(deploymentsTable)
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));

  if (!deployment) { res.status(404).json({ error: "Deployment not found" }); return; }
  res.json({ lines: (deployment.logs as string[]) ?? [], status: deployment.status });
});

router.get("/deployments/:id/heroku-status", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const user = (req as any).user;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid deployment id" }); return; }
  const [deployment] = await db.select().from(deploymentsTable)
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id), isNull(deploymentsTable.archivedAt)));
  if (!deployment) { res.status(404).json({ error: "Deployment not found" }); return; }
  if (!deployment.herokuAppId) { res.status(409).json({ status: deployment.status, error: "Heroku app is not available yet" }); return; }
  if (!await getHerokuKey()) { res.status(503).json({ status: deployment.status, error: "Heroku is not configured" }); return; }

  try {
    const headers = await herokuHeaders();
    const [dynosResponse, buildsResponse] = await Promise.all([
      fetch(`${HEROKU_BASE}/apps/${deployment.herokuAppId}/dynos`, { headers, signal: AbortSignal.timeout(10_000) }),
      fetch(`${HEROKU_BASE}/apps/${deployment.herokuAppId}/builds`, { headers, signal: AbortSignal.timeout(10_000) }),
    ]);
    if (!dynosResponse.ok) {
      const data = await dynosResponse.json().catch(() => ({})) as any;
      res.status(dynosResponse.status === 404 ? 404 : 502).json({ status: deployment.status, error: data.message ?? "Could not read Heroku dyno status" });
      return;
    }
    const dynos = await dynosResponse.json() as Array<{ id?: string; type?: string; state?: string; name?: string }>;
    const builds = buildsResponse.ok ? await buildsResponse.json() as Array<{ id: string; status: string; created_at?: string }> : [];
    const latestBuild = [...builds].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())[0];
    const dynoStates = dynos.map((dyno) => (dyno.state ?? "").toLowerCase());

    let status = deployment.status;
    if (dynoStates.includes("up")) status = "online";
    else if (dynoStates.some((state) => ["starting", "restarting"].includes(state)) || ["pending", "queued", "processing"].includes((latestBuild?.status ?? "").toLowerCase())) status = "building";
    else if (["failed", "errored", "canceled"].includes((latestBuild?.status ?? "").toLowerCase())) status = "error";
    else if (deployment.status === "building" && latestBuild?.status?.toLowerCase() === "succeeded") status = "offline";

    if (status !== deployment.status) {
      const label = status === "online" ? "Heroku confirms the bot is running" : status === "error" ? "Heroku reports that the build failed" : status === "offline" ? "Heroku build finished, but no dyno is running" : "Heroku is starting the bot";
      const existing = (deployment.logs as string[]) ?? [];
      await db.update(deploymentsTable).set({ status, logs: [...existing, `${ts()} ${label}`] })
        .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id), isNull(deploymentsTable.archivedAt)));
    }
    res.json({ status, dynos: dynos.map(({ name, type, state }) => ({ name, type, state })), buildStatus: latestBuild?.status ?? null, checkedAt: new Date().toISOString() });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    logger.warn({ err, deploymentId: id }, "Heroku status lookup failed");
    res.status(timedOut ? 504 : 502).json({ status: deployment.status, error: timedOut ? "Heroku status check timed out" : "Could not contact Heroku" });
  }
});

router.post("/deployments/:id/start", requireAuth, async (req, res): Promise<void> => {
  const suspendedCheck = (req as any).user; if (suspendedCheck.suspended) { res.status(403).json({ error: "Your account has been suspended. Contact support." }); return; }
  const user = (req as any).user;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select({ deployment: deploymentsTable, templateName: templatesTable.name, templateThumbnail: templatesTable.thumbnail })
    .from(deploymentsTable)
    .leftJoin(templatesTable, eq(deploymentsTable.templateId, templatesTable.id))
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id), isNull(deploymentsTable.archivedAt)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  if (row.deployment.expiresAt && row.deployment.expiresAt <= new Date()) { res.status(402).json({ error: "Hosting plan expired. Choose a new plan from the recovery page.", recover: true }); return; }

  const appName = row.deployment.herokuAppId;
  if (appName && await getHerokuKey()) {
    await fetch(`${HEROKU_BASE}/apps/${appName}/formation`, {
      method: "PATCH",
      headers: await herokuHeaders(),
      body: JSON.stringify({ updates: [{ type: "worker", quantity: 1, size: "eco" }] }),
    });
  }

  const logs = (row.deployment.logs as string[]) ?? [];
  const [updated] = await db.update(deploymentsTable)
    .set({ status: "online", logs: [...logs, `${ts()} Bot started`] })
    .where(eq(deploymentsTable.id, id)).returning();

  res.json(formatDeployment(updated, row.templateName ?? "Unknown", row.templateThumbnail));
});

router.post("/deployments/:id/stop", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select({ deployment: deploymentsTable, templateName: templatesTable.name, templateThumbnail: templatesTable.thumbnail })
    .from(deploymentsTable)
    .leftJoin(templatesTable, eq(deploymentsTable.templateId, templatesTable.id))
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id), isNull(deploymentsTable.archivedAt)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const appName = row.deployment.herokuAppId;
  if (appName && await getHerokuKey()) {
    await stopHerokuDynos(appName);
  }

  const logs = (row.deployment.logs as string[]) ?? [];
  const [updated] = await db.update(deploymentsTable)
    .set({ status: "offline", logs: [...logs, `${ts()} Bot stopped`] })
    .where(eq(deploymentsTable.id, id)).returning();

  res.json(formatDeployment(updated, row.templateName ?? "Unknown", row.templateThumbnail));
});

router.post("/deployments/:id/restart", requireAuth, async (req, res): Promise<void> => {
  const restartUserCheck = (req as any).user; if (restartUserCheck.suspended) { res.status(403).json({ error: "Your account has been suspended. Contact support." }); return; }
  const user = (req as any).user;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select({ deployment: deploymentsTable, templateName: templatesTable.name, templateThumbnail: templatesTable.thumbnail })
    .from(deploymentsTable)
    .leftJoin(templatesTable, eq(deploymentsTable.templateId, templatesTable.id))
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id), isNull(deploymentsTable.archivedAt)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  if (row.deployment.expiresAt && row.deployment.expiresAt <= new Date()) { res.status(402).json({ error: "Hosting plan expired. Choose a new plan from the recovery page.", recover: true }); return; }

  const appName = row.deployment.herokuAppId;
  if (appName && await getHerokuKey()) {
    await fetch(`${HEROKU_BASE}/apps/${appName}/dynos`, {
      method: "DELETE",
      headers: await herokuHeaders(),
    });
  }

  const logs = (row.deployment.logs as string[]) ?? [];
  const [updated] = await db.update(deploymentsTable)
    .set({ status: "online", logs: [...logs, `${ts()} Bot restarted`] })
    .where(eq(deploymentsTable.id, id)).returning();

  res.json(formatDeployment(updated, row.templateName ?? "Unknown", row.templateThumbnail));
});

router.delete("/deployments/:id", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select()
    .from(deploymentsTable)
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id), isNull(deploymentsTable.archivedAt)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (row.status === "building" && !row.herokuAppId) { res.status(409).json({ error: "Wait for the Heroku app name to appear before archiving this deployment" }); return; }

  // Archive the JuneX record so its app name, settings, and plan remain recoverable.
  if (row.herokuAppId) {
    if (!(await getHerokuKey())) { res.status(503).json({ error: "Heroku is not configured; the bot was not archived" }); return; }
    try {
      const deleteRes = await fetch(`${HEROKU_BASE}/apps/${row.herokuAppId}`, { method: "DELETE", headers: await herokuHeaders() });
      if (!deleteRes.ok && deleteRes.status !== 404) {
        const data = await deleteRes.json().catch(() => ({})) as any;
        res.status(502).json({ error: data.message ?? "Heroku could not stop and remove the bot" });
        return;
      }
    } catch {
      res.status(502).json({ error: "Could not reach Heroku; the bot was not archived" });
      return;
    }
  }

  const logs = (row.logs as string[]) ?? [];
  await db.update(deploymentsTable).set({ status: "archived", archivedAt: new Date(), logs: [...logs, `${ts()} Archived for recovery; Heroku app removed`] }).where(eq(deploymentsTable.id, id));
  res.json({ success: true, appName: row.herokuAppId, recoverable: true });
});

function normalizeAppName(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().replace(/^https?:\/\//i, "").replace(/\.herokuapp\.com\/?$/i, "").replace(/\/$/, "").toLowerCase();
}

async function findArchivedBot(userId: number, appName: string, botName: string) {
  const scope = and(eq(deploymentsTable.userId, userId), isNotNull(deploymentsTable.archivedAt));
  const [byAppName] = await db.select({ deployment: deploymentsTable, template: templatesTable })
    .from(deploymentsTable).innerJoin(templatesTable, eq(deploymentsTable.templateId, templatesTable.id))
    .where(and(scope, eq(deploymentsTable.herokuAppId, appName)));
  if (byAppName) return byAppName;
  const normalizedBotName = botName.trim().toLowerCase();
  if (!normalizedBotName) return undefined;
  const [byBotName] = await db.select({ deployment: deploymentsTable, template: templatesTable })
    .from(deploymentsTable).innerJoin(templatesTable, eq(deploymentsTable.templateId, templatesTable.id))
    .where(and(scope, sql`lower(trim(${deploymentsTable.botName})) = ${normalizedBotName}`))
    .orderBy(sql`${deploymentsTable.archivedAt} DESC`).limit(1);
  return byBotName;
}

async function findActiveBot(userId: number, appName: string, botName: string) {
  const scope = and(eq(deploymentsTable.userId, userId), isNull(deploymentsTable.archivedAt));
  const [byAppName] = await db.select({ id: deploymentsTable.id })
    .from(deploymentsTable).where(and(scope, eq(deploymentsTable.herokuAppId, appName)));
  if (byAppName) return byAppName;
  const normalizedBotName = botName.trim().toLowerCase();
  if (!normalizedBotName) return undefined;
  const [byBotName] = await db.select({ id: deploymentsTable.id })
    .from(deploymentsTable).where(and(scope, sql`lower(trim(${deploymentsTable.botName})) = ${normalizedBotName}`))
    .orderBy(sql`${deploymentsTable.createdAt} DESC`).limit(1);
  return byBotName;
}

router.get("/recovery/options", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const rows = await db.select({ id: deploymentsTable.id, botName: deploymentsTable.botName, templateName: templatesTable.name })
    .from(deploymentsTable).leftJoin(templatesTable, eq(deploymentsTable.templateId, templatesTable.id))
    .where(and(eq(deploymentsTable.userId, user.id), isNull(deploymentsTable.archivedAt)));
  res.json(rows.map((row) => ({ ...row, templateName: row.templateName ?? "Unknown" })));
});

router.get("/recovery/source/:id", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid source bot" }); return; }
  const [source] = await db.select({ id: deploymentsTable.id, botName: deploymentsTable.botName, envVars: deploymentsTable.envVars })
    .from(deploymentsTable).where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id), isNull(deploymentsTable.archivedAt)));
  if (!source) { res.status(404).json({ error: "Source bot not found" }); return; }
  res.json(source);
});

router.get("/recovery/lookup", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const identifier = typeof req.query.appName === "string" ? req.query.appName.trim() : "";
  const appName = normalizeAppName(identifier);
  if (!identifier) { res.status(400).json({ error: "Enter the bot name or app name" }); return; }
  const row = await findArchivedBot(user.id, appName, identifier);
  if (!row) {
    const active = await findActiveBot(user.id, appName, identifier);
    if (active) { res.status(409).json({ error: "This bot is still deployed. Delete it from My Bots first, then enter its bot name here to recover it." }); return; }
    res.status(404).json({ error: "No bot with that name was found on your account" });
    return;
  }
  const fields = (row.template.appJson as any)?.env ?? {};
  const [sources] = await Promise.all([db.select({ id: deploymentsTable.id, botName: deploymentsTable.botName, envVars: deploymentsTable.envVars })
    .from(deploymentsTable).where(and(eq(deploymentsTable.userId, user.id), isNull(deploymentsTable.archivedAt)))]);
  res.json({
    id: row.deployment.id, appName: row.deployment.herokuAppId ?? sanitizeAppName(row.deployment.botName, row.deployment.id), botName: row.deployment.botName,
    templateId: row.template.id, templateName: row.template.name, envVars: row.deployment.envVars,
    fields, planId: row.deployment.planId, expiresAt: row.deployment.expiresAt,
    daysLeft: row.deployment.expiresAt ? Math.max(0, Math.ceil((row.deployment.expiresAt.getTime() - Date.now()) / 86_400_000)) : 0,
    sources: sources.map(({ envVars: _envVars, ...source }) => source),
  });
});

router.post("/recovery", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const identifier = typeof req.body?.appName === "string" ? req.body.appName.trim() : "";
  const normalizedAppName = normalizeAppName(identifier);
  if (!identifier) { res.status(400).json({ error: "Bot name or app name is required" }); return; }
  const row = await findArchivedBot(user.id, normalizedAppName, identifier);
  if (!row) { res.status(404).json({ error: "Archived bot not found" }); return; }
  const appName = row.deployment.herokuAppId ?? sanitizeAppName(row.deployment.botName, row.deployment.id);
  if (!(await getHerokuKey())) { res.status(503).json({ error: "Heroku is not configured" }); return; }
  const inputVars = req.body?.envVars;
  if (!inputVars || typeof inputVars !== "object" || Array.isArray(inputVars) || Object.keys(inputVars).length > 100 || Object.values(inputVars).some((value) => typeof value !== "string" || value.length > 10_000)) {
    res.status(400).json({ error: "Bot configuration is invalid" }); return;
  }
  const sourceId = Number(req.body?.sourceDeploymentId);
  let sourceVars: Record<string, string> = {};
  if (Number.isInteger(sourceId) && sourceId > 0) {
    const [source] = await db.select({ envVars: deploymentsTable.envVars }).from(deploymentsTable)
      .where(and(eq(deploymentsTable.id, sourceId), eq(deploymentsTable.userId, user.id), isNull(deploymentsTable.archivedAt)));
    if (!source) { res.status(400).json({ error: "Selected source bot is unavailable" }); return; }
    sourceVars = source.envVars as Record<string, string>;
  }
  const envVars = { ...sourceVars, ...(inputVars as Record<string, string>) };
  const fields = (row.template.appJson as any)?.env ?? {};
  const missing = Object.entries(fields).find(([key, config]: [string, any]) => config.required !== false && !envVars[key]?.trim());
  if (missing) { res.status(400).json({ error: `${missing[0]} is required` }); return; }

  const stillValid = row.deployment.expiresAt && row.deployment.expiresAt > new Date();
  const plan = stillValid ? undefined : await findPlan(req.body?.planId);
  if (!stillValid && !plan) { res.status(400).json({ error: "The old plan expired. Select a plan to recover this bot" }); return; }
  const expiresAt = stillValid ? row.deployment.expiresAt! : new Date(Date.now() + plan!.days * 86_400_000);
  const result = await db.transaction(async (tx) => {
    if (!stillValid && user.role !== "admin") {
      const [account] = await tx.update(usersTable).set({ coinBalance: sql`${usersTable.coinBalance} - ${plan!.coins}` })
        .where(and(eq(usersTable.id, user.id), gte(usersTable.coinBalance, plan!.coins))).returning({ id: usersTable.id });
      if (!account) return null;
      await tx.insert(coinTransactionsTable).values({ userId: user.id, type: "debit", amount: plan!.coins, reference: `RECOVER-${row.deployment.id}-${Date.now()}`, description: `${plan!.name} recovery plan for ${row.deployment.botName}` });
    }
    const [updated] = await tx.update(deploymentsTable).set({
      status: "building", envVars, archivedAt: null, expiresAt, planId: plan?.id ?? row.deployment.planId,
      logs: [...((row.deployment.logs as string[]) ?? []), `${ts()} Recovery started`, `${ts()} Reusing app name ${appName}`],
    }).where(and(eq(deploymentsTable.id, row.deployment.id), isNotNull(deploymentsTable.archivedAt))).returning();
    return updated;
  });
  if (!result) { res.status(402).json({ error: "Not enough coins to renew this bot", requiredCoins: plan?.coins, balance: user.coinBalance }); return; }
  res.status(202).json({ id: result.id, appName });
  void herokuDeploy(result.id, row.template, result.botName, envVars);
});

router.patch("/deployments/:id/env", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { envVars } = req.body;
  if (!envVars || typeof envVars !== "object") {
    res.status(400).json({ error: "envVars must be an object" });
    return;
  }

  const [row] = await db
    .select({ deployment: deploymentsTable, templateName: templatesTable.name, templateThumbnail: templatesTable.thumbnail })
    .from(deploymentsTable)
    .leftJoin(templatesTable, eq(deploymentsTable.templateId, templatesTable.id))
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id), isNull(deploymentsTable.archivedAt)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  // Push to Heroku if app exists
  const appName = row.deployment.herokuAppId;
  if (appName && await getHerokuKey()) {
    await fetch(`${HEROKU_BASE}/apps/${appName}/config-vars`, {
      method: "PATCH",
      headers: await herokuHeaders(),
      body: JSON.stringify(envVars),
    }).catch(() => {});
  }

  const logs = (row.deployment.logs as string[]) ?? [];
  const [updated] = await db.update(deploymentsTable)
    .set({ envVars, logs: [...logs, `${ts()} Environment variables updated`] })
    .where(eq(deploymentsTable.id, id)).returning();

  res.json(formatDeployment(updated, row.templateName ?? "Unknown", row.templateThumbnail));
});


// ── Live logs from Heroku ─────────────────────────────────
router.get("/deployments/:id/heroku-logs", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const user = (req as any).user;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deployment] = await db
    .select()
    .from(deploymentsTable)
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id), isNull(deploymentsTable.archivedAt)));

  if (!deployment) { res.status(404).json({ error: "Not found" }); return; }
  if (!deployment.herokuAppId) { res.status(400).json({ error: "Bot not yet deployed to Heroku" }); return; }

  if (!await getHerokuKey()) { res.status(500).json({ error: "Heroku not configured" }); return; }

  try {
    // Get a log session from Heroku
    const sessionRes = await fetch(`${HEROKU_BASE}/apps/${deployment.herokuAppId}/log-sessions`, {
      method: "POST",
      headers: await herokuHeaders(),
      body: JSON.stringify({ lines: 100, tail: false }),
      signal: AbortSignal.timeout(10_000),
    });
    const sessionData = await sessionRes.json() as any;
    if (!sessionRes.ok) { res.status(400).json({ error: sessionData.message ?? "Could not fetch logs" }); return; }

    // Fetch the actual log content
    const logsRes = await fetch(sessionData.logplex_url, { signal: AbortSignal.timeout(10_000) });
    const logsText = await logsRes.text();
    const lines = logsText.split("\n").filter(Boolean);

    res.json({ lines, herokuAppId: deployment.herokuAppId });
  } catch (err) {
    logger.error({ err }, "Heroku logs error");
    res.status(500).json({ error: "Failed to fetch Heroku logs" });
  }
});

// ── Live logs from Heroku ─────────────────────────────────
export default router;




