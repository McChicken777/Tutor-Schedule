import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { teachersTable } from "./teachers";

// Reporter and reported-user are polymorphic across usersTable/teachersTable,
// so each is split into two nullable role-specific FK columns rather than one
// untyped id. Route handlers enforce "exactly one reporter column set" and
// "at most one reported-user column set" — see routes/student.ts, teacher.ts,
// admin.ts. targetId has no FK (points into messages or homework_files
// depending on targetType, or is null for a general report) — validity is
// checked at write time in the route handler, not the DB.
export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  reporterRole: text("reporter_role").notNull(), // "student" | "teacher"
  reporterStudentId: integer("reporter_student_id").references(() => usersTable.id),
  reporterTeacherId: integer("reporter_teacher_id").references(() => teachersTable.id),
  targetType: text("target_type").notNull(), // "message" | "homework_file" | "general"
  targetId: integer("target_id"),
  reportedUserRole: text("reported_user_role"), // "student" | "teacher" | null
  reportedStudentId: integer("reported_student_id").references(() => usersTable.id),
  reportedTeacherId: integer("reported_teacher_id").references(() => teachersTable.id),
  body: text("body").notNull(),
  status: text("status").notNull().default("open"), // "open" | "resolved" | "actioned"
  actionedAt: timestamp("actioned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReportSchema = createInsertSchema(reportsTable).omit({ id: true, createdAt: true, actionedAt: true });
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reportsTable.$inferSelect;
