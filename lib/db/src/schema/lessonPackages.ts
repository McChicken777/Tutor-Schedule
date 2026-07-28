import { pgTable, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { lessonTypesTable } from "./lessonTypes";

export const lessonPackagesTable = pgTable("lesson_packages", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id),
  lessonTypeId: integer("lesson_type_id").notNull().references(() => lessonTypesTable.id),
  totalCredits: integer("total_credits").notNull(),
  usedCredits: integer("used_credits").notNull().default(0),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLessonPackageSchema = createInsertSchema(lessonPackagesTable).omit({ id: true, createdAt: true });
export type InsertLessonPackage = z.infer<typeof insertLessonPackageSchema>;
export type LessonPackage = typeof lessonPackagesTable.$inferSelect;
