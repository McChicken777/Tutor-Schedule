import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teachersTable } from "./teachers";

export const faqsTable = pgTable("faqs", {
  id: serial("id").primaryKey(),
  // Nullable only during the multi-tenant cutover backfill (see
  // scripts/backfill-testimonials-faqs-teacher-id.ts); becomes NOT NULL once
  // existing rows are backfilled.
  teacherId: integer("teacher_id").references(() => teachersTable.id),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  isVisible: boolean("is_visible").notNull().default(true),
});

export const insertFaqSchema = createInsertSchema(faqsTable).omit({ id: true });
export type InsertFaq = z.infer<typeof insertFaqSchema>;
export type Faq = typeof faqsTable.$inferSelect;
