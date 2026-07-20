import { Router, type IRouter } from "express";
import { db, templatesTable, deploymentsTable } from "@workspace/db";
import { eq, ilike, and, or, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function uniqueSlug(base: string, excludeId?: number): Promise<string> {
  let slug = base;
  let suffix = 0;
  while (true) {
    const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
    const existing = await db
      .select({ id: templatesTable.id })
      .from(templatesTable)
      .where(eq(templatesTable.slug, candidate));
    if (existing.length === 0 || (excludeId != null && existing[0].id === excludeId)) {
      return candidate;
    }
    suffix++;
  }
}

function formatTemplate(t: typeof templatesTable.$inferSelect, deployCount = 0) {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    githubRepo: t.githubRepo,
    thumbnail: t.thumbnail ?? null,
    category: t.category,
    appJson: t.appJson,
    isFree: t.isFree ?? false,
    price: t.price ?? 0,
    currency: t.currency ?? "KES",
    pairSiteUrl: t.pairSiteUrl ?? null,
    deployCount,
    createdAt: t.createdAt,
  };
}

router.get("/templates", async (req, res): Promise<void> => {
  const { search, category } = req.query as { search?: string; category?: string };
  let query = db.select().from(templatesTable).$dynamic();
  const conditions = [];
  if (search) conditions.push(or(ilike(templatesTable.name, `%${search}%`), ilike(templatesTable.description, `%${search}%`)));
  if (category) conditions.push(eq(templatesTable.category, category));
  if (conditions.length > 0) query = query.where(and(...conditions));
  const templates = await query;

  const counts = await db
    .select({ templateId: deploymentsTable.templateId, count: sql<number>`count(*)::int` })
    .from(deploymentsTable)
    .groupBy(deploymentsTable.templateId);
  const countMap = Object.fromEntries(counts.map(c => [c.templateId, c.count]));

  res.json(templates.map(t => formatTemplate(t, countMap[t.id] ?? 0)));
});

router.get("/templates/categories", async (_req, res): Promise<void> => {
  const templates = await db.select({ category: templatesTable.category }).from(templatesTable);
  const cats = [...new Set(templates.map(t => t.category))].filter(Boolean);
  res.json(cats);
});

// Accepts either a numeric id OR a slug string
router.get("/templates/:idOrSlug", async (req, res): Promise<void> => {
  const { idOrSlug } = req.params as { idOrSlug: string };
  const numericId = parseInt(idOrSlug, 10);
  const isNumeric = !isNaN(numericId) && String(numericId) === idOrSlug;

  const [template] = isNumeric
    ? await db.select().from(templatesTable).where(eq(templatesTable.id, numericId))
    : await db.select().from(templatesTable).where(eq(templatesTable.slug, idOrSlug));

  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(formatTemplate(template));
});

router.post("/templates", requireAdmin, async (req, res): Promise<void> => {
  const { name, slug: rawSlug, description, githubRepo, thumbnail, category, appJson, isFree, price, currency, pairSiteUrl } = req.body;
  if (!name || !description || !githubRepo || !category || !appJson) {
    res.status(400).json({ error: "name, description, githubRepo, category and appJson are required" });
    return;
  }
  const slugBase = rawSlug ? toSlug(rawSlug) : toSlug(name);
  const slug = await uniqueSlug(slugBase);

  const [template] = await db.insert(templatesTable).values({
    name, slug, description, githubRepo,
    thumbnail: thumbnail ?? null,
    category,
    appJson,
    isFree: isFree ?? false,
    price: isFree ? 0 : (price ?? 0),
    currency: currency ?? "KES",
    pairSiteUrl: pairSiteUrl ?? null,
  }).returning();
  res.status(201).json(formatTemplate(template));
});

router.patch("/templates/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, slug: rawSlug, description, githubRepo, thumbnail, category, appJson, isFree, price, currency, pairSiteUrl } = req.body;

  let slug: string | undefined;
  if (rawSlug) {
    slug = await uniqueSlug(toSlug(rawSlug), id);
  }

  const [template] = await db.update(templatesTable).set({
    ...(name && { name }),
    ...(slug && { slug }),
    ...(description && { description }),
    ...(githubRepo && { githubRepo }),
    ...(thumbnail !== undefined && { thumbnail }),
    ...(category && { category }),
    ...(appJson && { appJson }),
    ...(isFree !== undefined && { isFree }),
    ...(price !== undefined && { price: isFree ? 0 : price }),
    ...(currency && { currency }),
    ...(pairSiteUrl !== undefined && { pairSiteUrl }),
  }).where(eq(templatesTable.id, id)).returning();
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(formatTemplate(template));
});

router.delete("/templates/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(templatesTable).where(eq(templatesTable.id, id));
  res.sendStatus(204);
});

export default router;
