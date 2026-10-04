
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { db, templatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function replaceMeta(html: string, property: string, content: string): string {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = new RegExp(`(<meta\\s+property=["']${escapedProperty}["']\\s+content=["'])[^"']*(["'][^>]*>)`, "i");
  return html.replace(tag, (_match, prefix: string, suffix: string) => `${prefix}${escapeHtml(content)}${suffix}`);
}

function replaceNamedMeta(html: string, name: string, content: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = new RegExp(`(<meta\\s+name=["']${escapedName}["']\\s+content=["'])[^"']*(["'][^>]*>)`, "i");
  return html.replace(tag, (_match, prefix: string, suffix: string) => `${prefix}${escapeHtml(content)}${suffix}`);
}

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
// Social crawlers do not run the client-side JavaScript that normally fills
// in template metadata. Render the public Open Graph tags into the initial HTML.
app.get("/templates/:slug", async (req, res, next) => {
  try {
    const slug = req.params.slug;
    const numericId = Number.parseInt(slug, 10);
    const [template] = Number.isInteger(numericId) && String(numericId) === slug
      ? await db.select().from(templatesTable).where(eq(templatesTable.id, numericId))
      : await db.select().from(templatesTable).where(eq(templatesTable.slug, slug));

    if (!template) {
      res.sendFile(path.join(publicDir, "index.html"));
      return;
    }

    const configuredBase = process.env.FRONTEND_URL?.split(",")[0].trim();
    const frontendBase = (configuredBase || "https://host.junex.space").replace(/\/$/, "");
    const pageUrl = new URL(`/templates/${encodeURIComponent(slug)}`, frontendBase).toString();
    let imageUrl = new URL("/favicon.svg", frontendBase).toString();
    if (template.thumbnail) {
      const thumbnailUrl = new URL(template.thumbnail, frontendBase);
      if (thumbnailUrl.protocol === "https:" || thumbnailUrl.protocol === "http:") imageUrl = thumbnailUrl.toString();
    }
    let html = await readFile(path.join(publicDir, "index.html"), "utf8");
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(template.name)} - J.H.P</title>`);
    html = replaceMeta(html, "og:url", pageUrl);
    html = replaceMeta(html, "og:title", template.name);
    html = replaceMeta(html, "og:description", template.description);
    html = replaceMeta(html, "og:image", imageUrl);
    html = replaceNamedMeta(html, "twitter:url", pageUrl);
    html = replaceNamedMeta(html, "twitter:title", template.name);
    html = replaceNamedMeta(html, "twitter:description", template.description);
    html = replaceNamedMeta(html, "twitter:image", imageUrl);
    html = replaceNamedMeta(html, "twitter:card", "summary_large_image");
    html = replaceNamedMeta(html, "description", template.description);
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    res.type("html").send(html);
  } catch (error) {
    next(error);
  }
});
const teamUploadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../junex/uploads/team");
app.use("/uploads/team", express.static(teamUploadsDir, { fallthrough: false, immutable: true, maxAge: "1y" }));
app.use(express.static(publicDir));
app.get(/.*/, (_req, res, next) => {
  res.sendFile(path.join(publicDir, "index.html"), (error) => {
    if (error) next(error);
  });
});

export default app;
