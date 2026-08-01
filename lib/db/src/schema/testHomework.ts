import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const testHomeworkTable = pgTable("test_homework", {
  id: serial("id").primaryKey(),
  assignedText: text("assigned_text"),
  assignedFileUrl: text("assigned_file_url"),
  assignedFileKey: text("assigned_file_key"),
  assignedFileName: text("assigned_file_name"),
  assignedFileMime: text("assigned_file_mime"),
  submittedText: text("submitted_text"),
  fileUrl: text("file_url"),
  submittedFileKey: text("submitted_file_key"),
  submittedFileName: text("submitted_file_name"),
  submittedFileMime: text("submitted_file_mime"),
  reviewedFileKey: text("reviewed_file_key"),
  reviewedFileName: text("reviewed_file_name"),
  reviewedFileMime: text("reviewed_file_mime"),
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
