import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingsTable } from "./bookings";

export const homeworkTable = pgTable("homework", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id).unique(),
  noHomework: boolean("no_homework").notNull().default(false),
  assignedText: text("assigned_text"),
  // Column kept as `assigned_file_url` in the DB (pre-existing data), just renamed here for clarity now
  // that uploaded files live in homeworkFilesTable instead — this column is only ever a pasted link.
  assignedLinkUrl: text("assigned_file_url"),
  submittedText: text("submitted_text"),
  // Same story: `file_url` in the DB was always the student's pasted-link field, not an uploaded file.
  submittedLinkUrl: text("file_url"),
  tutorFeedback: text("tutor_feedback"),
  grade: text("grade"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  studentReviewSeenAt: timestamp("student_review_seen_at", { withTimezone: true }),
  reminderActive: boolean("reminder_active").notNull().default(false),
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  // --- Deprecated: superseded by homeworkFilesTable. Kept only so the one-off backfill
  // script (scripts/backfill-homework-files.ts) can copy pre-existing uploads into the new
  // table; dropped in a follow-up schema push once that backfill has run. Do not read/write
  // these from application code. ---
  assignedFileKey: text("assigned_file_key"),
  assignedFileName: text("assigned_file_name"),
  assignedFileMime: text("assigned_file_mime"),
  submittedFileKey: text("submitted_file_key"),
  submittedFileName: text("submitted_file_name"),
  submittedFileMime: text("submitted_file_mime"),
  reviewedFileKey: text("reviewed_file_key"),
  reviewedFileName: text("reviewed_file_name"),
  reviewedFileMime: text("reviewed_file_mime"),
});

export const insertHomeworkSchema = createInsertSchema(homeworkTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHomework = z.infer<typeof insertHomeworkSchema>;
export type Homework = typeof homeworkTable.$inferSelect;
