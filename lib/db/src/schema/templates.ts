import { pgTable, text, serial, timestamp, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const templatesTable = pgTable("templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  githubRepo: text("github_repo").notNull(),
  thumbnail: text("thumbnail"),
  category: text("category").notNull(),
  appJson: jsonb("app_json").notNull(),
  isFree: boolean("is_free").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  showDeployCount: boolean("show_deploy_count").notNull().default(true),
  price: integer("price").notNull().default(0),
  currency: text("currency").notNull().default("KES"),
  pairSiteUrl: text("pair_site_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTemplateSchema = createInsertSchema(templatesTable).omit({ id: true, createdAt: true });
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Template = typeof templatesTable.$inferSelect;
