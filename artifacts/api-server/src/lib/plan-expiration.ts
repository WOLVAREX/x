import { and, eq, isNull, lte } from "drizzle-orm";
import { db, deploymentsTable } from "@workspace/db";
import { getSetting } from "./settings";
import { logger } from "./logger";

const HEROKU_BASE = "https://api.heroku.com";
let running = false;

async function stopExpiredBots() {
  if (running) return;
  running = true;
  try {
    const expired = await db.select().from(deploymentsTable).where(and(
      isNull(deploymentsTable.archivedAt),
      lte(deploymentsTable.expiresAt, new Date()),
      // All expired states should be updated, but avoid repeatedly handling stopped apps.
      eq(deploymentsTable.status, "online"),
    )).limit(50);
    if (!expired.length) return;
    const key = (await getSetting("HEROKU_TEAM_API_KEY")) || (await getSetting("HEROKU_API_KEY"));
    if (!key) return;
    for (const deployment of expired) {
      if (!deployment.herokuAppId) continue;
      try {
        const headers = { Authorization: `Bearer ${key}`, Accept: "application/vnd.heroku+json; version=3", "Content-Type": "application/json" };
        const formationRes = await fetch(`${HEROKU_BASE}/apps/${deployment.herokuAppId}/formation`, { headers });
        if (!formationRes.ok) continue;
        const formations = await formationRes.json() as Array<{ type: string; quantity: number }>;
        const updates = formations.filter(({ quantity }) => quantity > 0).map(({ type }) => ({ type, quantity: 0 }));
        if (updates.length) {
          const response = await fetch(`${HEROKU_BASE}/apps/${deployment.herokuAppId}/formation`, {
            method: "PATCH", headers, body: JSON.stringify({ updates }),
          });
          if (!response.ok) continue;
        }
        const logs = (deployment.logs as string[]) ?? [];
        await db.update(deploymentsTable).set({ status: "expired", logs: [...logs, `[${new Date().toISOString()}] Hosting plan expired; bot stopped`] }).where(eq(deploymentsTable.id, deployment.id));
      } catch (err) {
        logger.warn({ err, deploymentId: deployment.id }, "Could not stop an expired bot");
      }
    }
  } catch (err) {
    logger.error({ err }, "Plan expiry scan failed");
  } finally {
    running = false;
  }
}

export function startPlanExpirationMonitor() {
  const timer = setInterval(() => void stopExpiredBots(), 60_000);
  timer.unref();
  void stopExpiredBots();
}
