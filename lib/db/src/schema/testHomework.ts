import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const testHomeworkTable = pgTable("test_homework", {
  id: serial("id").primaryKey(),
  assignedText: text("assigned_text"),
  submittedText: text("submitted_text"),
  tutorFeedback: text("tutor_feedback"),
  grade: text("grade"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTestHomeworkSchema = createInsertSchema(testHomeworkTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTestHomework = z.infer<typeof insertTestHomeworkSchema>;
export type TestHomework = typeof testHomeworkTable.$inferSelect;
