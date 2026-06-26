import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const walletTransactionsTable = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),           // deposit | deduction
  amount: integer("amount").notNull(),    // in cents, always positive
  currency: text("currency").notNull().default("KES"),
  reference: text("reference").unique(),  // Paystack reference for deposits
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"), // pending | success | failed
  method: text("method"),                 // card | mpesa (for deposits)
  balanceAfter: integer("balance_after").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWalletTransactionSchema = createInsertSchema(walletTransactionsTable).omit({ id: true, createdAt: true });
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;
