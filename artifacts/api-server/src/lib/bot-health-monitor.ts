import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, deploymentsTable } from "@workspace/db";
import { logger } from "./logger";
import { getSetting } from "./settings";
import { getBotHealth } from "./bot-health";
import { appendDeploymentLog } from "./deployment-logs";

const HEROKU_BASE = "https://api.heroku.com";
const FAILED_RETENTION_MS = 10 * 60_000;
let running = false;

async function checkBots() {
  if (running) return;
  running = true;
  try {
    const active = await db.select().from(deploymentsTable).where(and(
      isNull(deploymentsTable.archivedAt),
      isNull(deploymentsTable.herokuDeletedAt),
      inArray(deploymentsTable.status, ["online", "building", "queued", "failed", "error"]),
    ));
    if (!active.length) return;
    const key = (await getSetting("HEROKU_TEAM_API_KEY")) || (await getSetting("HEROKU_API_KEY"));
    if (!key) return;

    for (let offset = 0; offset < active.length; offset += 5) {
      const batch = active.slice(offset, offset + 5);
      await Promise.all(batch.map(async (deployment) => {
      if (!deployment.herokuAppId) return;
      try {
        const health = await getBotHealth(deployment);
        const now = new Date();
        const failed = health.status === "failed";
        const failedAt = failed ? deployment.failedAt ?? now : null;
        const failureReason = failed ? health.failureReason : null;
        const changed = health.status !== deployment.status || failureReason !== deployment.failureReason;
        const statusEvent = health.status === "online"
          ? "Heroku dyno is up; WhatsApp session status is not verified by J.H.P."
          : failed
            ? `Heroku reports failure: ${failureReason ?? "Unknown failure"}`
            : `Heroku dyno status changed to ${health.status}`;

        if (health.herokuAppMissing) {
          await db.update(deploymentsTable).set({
            status: "failed", failedAt: failedAt ?? now,
            failureReason: failureReason ?? "The Heroku app no longer exists",
            herokuDeletedAt: now,
          }).where(eq(deploymentsTable.id, deployment.id));
          if (changed) await appendDeploymentLog(deployment.id, statusEvent);
          await appendDeploymentLog(deployment.id, "Heroku app was already removed; recover this bot to redeploy it");
          return;
        }

        if (failed && failedAt && now.getTime() - failedAt.getTime() >= FAILED_RETENTION_MS) {
          const response = await fetch(`${HEROKU_BASE}/apps/${deployment.herokuAppId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${key}`, Accept: "application/vnd.heroku+json; version=3" },
            signal: AbortSignal.timeout(15_000),
          });
          if (!response.ok && response.status !== 404) {
            logger.warn({ deploymentId: deployment.id, status: response.status }, "Could not delete a bot that has remained failed for ten minutes");
            await db.update(deploymentsTable).set({ status: "failed", failedAt, failureReason })
              .where(eq(deploymentsTable.id, deployment.id));
            if (changed) await appendDeploymentLog(deployment.id, statusEvent);
            return;
          }
          await db.update(deploymentsTable).set({
            status: "failed", failedAt, failureReason, herokuDeletedAt: now,
          }).where(eq(deploymentsTable.id, deployment.id));
          if (changed) await appendDeploymentLog(deployment.id, statusEvent);
          await appendDeploymentLog(deployment.id, "Heroku app remained failed for ten minutes and was deleted. Recover this bot to redeploy it.");
          logger.info({ deploymentId: deployment.id }, "Deleted a bot after ten minutes in failed state");
          return;
        }

        if (changed || failedAt?.getTime() !== deployment.failedAt?.getTime()) {
          await db.update(deploymentsTable).set({
            status: health.status,
            failedAt,
            failureReason,
          }).where(eq(deploymentsTable.id, deployment.id));
          if (changed) await appendDeploymentLog(deployment.id, statusEvent);
        }
      } catch (err) {
        logger.warn({ err, deploymentId: deployment.id }, "Bot health check failed");
      }
      }));
    }
  } catch (err) {
    logger.error({ err }, "Bot health monitor failed");
  } finally {
    running = false;
  }
}

export function startBotHealthMonitor() {
  const timer = setInterval(() => void checkBots(), 60_000);
  timer.unref();
  void checkBots();
}
