import app from "./app";
import { logger } from "./lib/logger";
import { loadSettingsFromDb } from "./lib/settings";
import { startPlanExpirationMonitor } from "./lib/plan-expiration";
import { startBotHealthMonitor } from "./lib/bot-health-monitor";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const host =
  process.env["HOST"] ??
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in production.");
}

loadSettingsFromDb().then(() => {
  app.listen(port, host, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ host, port }, "Server listening");
    startPlanExpirationMonitor();
    startBotHealthMonitor();
  });
});
