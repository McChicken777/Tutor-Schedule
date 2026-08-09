import { pgTable, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { teachersTable } from "./teachers";
import { lessonTypesTable } from "./lessonTypes";
import { packageRequestsTable } from "./packageRequests";

// A student's granted lesson balance. One row per grant, so a student can hold
// several (e.g. a 10-pack bought in March and a 5-pack in June); booking draws
// them down oldest-first.
//
// Balances are held PER LESSON TYPE rather than as fungible credits: five 45min
// lessons cannot be spent on an 85min one. That mirrors how the lessons are
// actually sold — each length has its own price and its own packages.
export const lessonPackagesTable = pgTable("lesson_packages", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id),
  teacherId: integer("teacher_id").references(() => teachersTable.id).notNull(),
  lessonTypeId: integer("lesson_type_id").references(() => lessonTypesTable.id).notNull(),
  totalLessons: integer("total_lessons").notNull(),
  usedLessons: integer("used_lessons").notNull().default(0),
  // Null for balances granted by hand rather than through a request.
  packageRequestId: integer("package_request_id").references(() => packageRequestsTable.id, {
    onDelete: "set null",
  }),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLessonPackageSchema = createInsertSchema(lessonPackagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLessonPackage = z.infer<typeof insertLessonPackageSchema>;
export type LessonPackage = typeof lessonPackagesTable.$inferSelect;
