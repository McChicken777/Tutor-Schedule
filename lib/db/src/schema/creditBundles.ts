import { pgTable, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teachersTable } from "./teachers";

export const creditBundlesTable = pgTable("credit_bundles", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").references(() => teachersTable.id),
  credits: integer("credits").notNull(),
  priceCents: integer("price_cents").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCreditBundleSchema = createInsertSchema(creditBundlesTable).omit({ id: true, createdAt: true });
export type InsertCreditBundle = z.infer<typeof insertCreditBundleSchema>;
export type CreditBundle = typeof creditBundlesTable.$inferSelect;
