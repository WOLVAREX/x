
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const renderOrigin = process.env.RENDER_EXTERNAL_URL;
const allowedOrigins = (process.env.FRONTEND_URL ?? renderOrigin ?? "http://localhost:5000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const publicDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../junex/dist/public",
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
const teamUploadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../junex/uploads/team");
app.use("/uploads/team", express.static(teamUploadsDir, { fallthrough: false, immutable: true, maxAge: "1y" }));
app.use(express.static(publicDir));
app.get(/.*/, (_req, res, next) => {
  res.sendFile(path.join(publicDir, "index.html"), (error) => {
    if (error) next(error);
  });
});

export default app;
