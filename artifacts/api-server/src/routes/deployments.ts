import { Router, type IRouter } from "express";
import { db, deploymentsTable, templatesTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";
import { getSetting } from "../lib/settings";

const router: IRouter = Router();

const HEROKU_BASE = "https://api.heroku.com";

async function getHerokuKey(): Promise<string> {
  return getSetting("HEROKU_API_KEY");
}

async function herokuHeaders(accept = "application/vnd.heroku+json; version=3") {
  return {
    Authorization: `Bearer ${await getHerokuKey()}`,
    Accept: accept,
    "Content-Type": "application/json",
  };
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
    status: d.status,
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
    // â”€â”€ Step 1: Create Heroku app â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    await appendLog(deploymentId, "Initializing deployment...");
    await appendLog(deploymentId, `Creating Heroku app: ${appName}`);

    const createRes = await fetch(`${HEROKU_BASE}/apps`, {
      method: "POST",
      headers: await herokuHeaders(),
      body: JSON.stringify({ name: appName, stack: "heroku-22" }),
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

    // â”€â”€ Step 2: Set environment variables â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    await appendLog(deploymentId, "Configuring environment variables...");

    const configVars: Record<string, string> = { ...envVars };
    const appJsonEnv = (template.appJson as any)?.env ?? {};

    // Merge any defaults from app.json
    for (const [key, val] of Object.entries(appJsonEnv)) {
      if (!(key in configVars) && typeof (val as any).value === "string") {
        configVars[key] = (val as any).value;
      }
    }

    if (Object.keys(configVars).length > 0) {
      const configRes = await fetch(`${HEROKU_BASE}/apps/${appName}/config-vars`, {
        method: "PATCH",
        headers: await herokuHeaders(),
        body: JSON.stringify(configVars),
      });
      if (!configRes.ok) {
        const configData = await configRes.json() as any;
        await appendLog(deploymentId, `WARNING: Config vars partially set â€” ${configData.message ?? "unknown error"}`);
      } else {
        await appendLog(deploymentId, `${Object.keys(configVars).length} environment variable(s) configured`);
      }
    }

    // â”€â”€ Step 3: Connect GitHub repo and create build â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Step 4: Create build from tarball â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      await appendLog(deploymentId, `ERROR: Build failed to start â€” ${buildData.message ?? "unknown"}`);
      await db.update(deploymentsTable).set({ status: "error" }).where(eq(deploymentsTable.id, deploymentId));
      return;
    }

    const buildId = buildData.id as string;
    await appendLog(deploymentId, `Build started (ID: ${buildId})`);
    await appendLog(deploymentId, "Compiling dependencies...");

    // â”€â”€ Step 5: Poll build status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let buildStatus = "pending";
    let attempts = 0;
    const maxAttempts = 60; // 5 min timeout

    while (buildStatus === "pending" && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 5000));
      attempts++;

      const statusRes = await fetch(`${HEROKU_BASE}/apps/${appName}/builds/${buildId}`, {
        headers: await herokuHeaders(),
      });
      const statusData = await statusRes.json() as any;
      buildStatus = statusData.status ?? "pending";

      if (attempts % 3 === 0) {
        await appendLog(deploymentId, `Build in progress... (${attempts * 5}s elapsed)`);
      }
    }

    if (buildStatus !== "succeeded") {
      await appendLog(deploymentId, `ERROR: Build ${buildStatus} after ${attempts * 5}s`);
      await appendLog(deploymentId, "Check your app.json and repository for errors");
      await db.update(deploymentsTable).set({ status: "error" }).where(eq(deploymentsTable.id, deploymentId));
      return;
    }

    await appendLog(deploymentId, "Build succeeded!");

    // â”€â”€ Step 6: Scale dynos (start the bot) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Step 7: Mark as online â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get("/deployments", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const rows = await db
    .select({ deployment: deploymentsTable, templateName: templatesTable.name, templateThumbnail: templatesTable.thumbnail })
    .from(deploymentsTable)
    .leftJoin(templatesTable, eq(deploymentsTable.templateId, templatesTable.id))
    .where(eq(deploymentsTable.userId, user.id))
    .orderBy(deploymentsTable.createdAt);
  res.json(rows.map(r => formatDeployment(r.deployment, r.templateName ?? "Unknown", r.templateThumbnail)));
});

router.post("/deployments", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { templateId, botName, envVars } = req.body;

  if (!templateId || !botName) {
    res.status(400).json({ error: "templateId and botName are required" });
    return;
  }

  if (!await getHerokuKey()) {
    res.status(500).json({ error: "Heroku API key not configured. Add HEROKU_API_KEY to .env" });
    return;
  }

  const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, templateId));
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }

  const [deployment] = await db.insert(deploymentsTable).values({
    userId: user.id,
    templateId,
    botName,
    status: "building",
    envVars: envVars ?? {},
    logs: [
      `${ts()} Deployment request received`,
      `${ts()} Template: ${template.name}`,
      `${ts()} Bot name: ${botName}`,
    ],
  }).returning();

  // Return immediately â€” deploy runs in background
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
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));

  if (!row) { res.status(404).json({ error: "Deployment not found" }); return; }
  res.json(formatDeployment(row.deployment, row.templateName ?? "Unknown", row.templateThumbnail));
});

router.get("/deployments/:id/logs", requireAuth, async (req, res): Promise<void> => {
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

router.post("/deployments/:id/start", requireAuth, async (req, res): Promise<void> => {
  const suspendedCheck = (req as any).user; if (suspendedCheck.suspended) { res.status(403).json({ error: "Your account has been suspended. Contact support." }); return; }
  const user = (req as any).user;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select({ deployment: deploymentsTable, templateName: templatesTable.name, templateThumbnail: templatesTable.thumbnail })
    .from(deploymentsTable)
    .leftJoin(templatesTable, eq(deploymentsTable.templateId, templatesTable.id))
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

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
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const appName = row.deployment.herokuAppId;
  if (appName && await getHerokuKey()) {
    await fetch(`${HEROKU_BASE}/apps/${appName}/formation`, {
      method: "PATCH",
      headers: await herokuHeaders(),
      body: JSON.stringify({ updates: [{ type: "worker", quantity: 0 }] }),
    });
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
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

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
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  // Delete Heroku app too
  if (row.herokuAppId && await getHerokuKey()) {
    await fetch(`${HEROKU_BASE}/apps/${row.herokuAppId}`, {
      method: "DELETE",
      headers: await herokuHeaders(),
    }).catch(() => {});
  }

  await db.delete(deploymentsTable).where(eq(deploymentsTable.id, id));
  res.sendStatus(204);
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
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
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


// â”€â”€ Live logs from Heroku â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/deployments/:id/heroku-logs", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deployment] = await db
    .select()
    .from(deploymentsTable)
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));

  if (!deployment) { res.status(404).json({ error: "Not found" }); return; }
  if (!deployment.herokuAppId) { res.status(400).json({ error: "Bot not yet deployed to Heroku" }); return; }

  if (!await getHerokuKey()) { res.status(500).json({ error: "Heroku not configured" }); return; }

  try {
    // Get a log session from Heroku
    const sessionRes = await fetch(`${HEROKU_BASE}/apps/${deployment.herokuAppId}/log-sessions`, {
      method: "POST",
      headers: await herokuHeaders(),
      body: JSON.stringify({ lines: 100, tail: false }),
    });
    const sessionData = await sessionRes.json() as any;
    if (!sessionRes.ok) { res.status(400).json({ error: sessionData.message ?? "Could not fetch logs" }); return; }

    // Fetch the actual log content
    const logsRes = await fetch(sessionData.logplex_url);
    const logsText = await logsRes.text();
    const lines = logsText.split("\n").filter(Boolean);

    res.json({ lines, herokuAppId: deployment.herokuAppId });
  } catch (err) {
    logger.error({ err }, "Heroku logs error");
    res.status(500).json({ error: "Failed to fetch Heroku logs" });
  }
});

// â”€â”€ Live logs from Heroku â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/deployments/:id/heroku-logs", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deployment] = await db
    .select()
    .from(deploymentsTable)
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));

  if (!deployment) { res.status(404).json({ error: "Not found" }); return; }
  if (!deployment.herokuAppId) { res.status(400).json({ error: "Bot not yet deployed to Heroku" }); return; }

  if (!await getHerokuKey()) { res.status(500).json({ error: "Heroku not configured" }); return; }

  try {
    // Get a log session from Heroku
    const sessionRes = await fetch(`${HEROKU_BASE}/apps/${deployment.herokuAppId}/log-sessions`, {
      method: "POST",
      headers: await herokuHeaders(),
      body: JSON.stringify({ lines: 100, tail: false }),
    });
    const sessionData = await sessionRes.json() as any;
    if (!sessionRes.ok) { res.status(400).json({ error: sessionData.message ?? "Could not fetch logs" }); return; }

    // Fetch the actual log content
    const logsRes = await fetch(sessionData.logplex_url);
    const logsText = await logsRes.text();
    const lines = logsText.split("\n").filter(Boolean);

    res.json({ lines, herokuAppId: deployment.herokuAppId });
  } catch (err) {
    logger.error({ err }, "Heroku logs error");
    res.status(500).json({ error: "Failed to fetch Heroku logs" });
  }
});
export default router;




