import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { templatesTable } from "./templates";

export const deploymentsTable = pgTable("deployments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  templateId: integer("template_id").notNull().references(() => templatesTable.id, { onDelete: "cascade" }),
  botName: text("bot_name").notNull(),
  herokuAppId: text("heroku_app_id"),
  status: text("status").notNull().default("queued"),
  envVars: jsonb("env_vars").notNull().default({}),
  planId: text("plan_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  logs: text("logs").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDeploymentSchema = createInsertSchema(deploymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeployment = z.infer<typeof insertDeploymentSchema>;
export type Deployment = typeof deploymentsTable.$inferSelect;
