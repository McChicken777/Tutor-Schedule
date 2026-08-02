import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teachersTable } from "./teachers";

export const lessonTypesTable = pgTable("lesson_types", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").references(() => teachersTable.id).notNull(),
  name: text("name").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  creditCost: integer("credit_cost").notNull().default(1),
  description: text("description").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isTrial: boolean("is_trial").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLessonTypeSchema = createInsertSchema(lessonTypesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLessonType = z.infer<typeof insertLessonTypeSchema>;
export type LessonType = typeof lessonTypesTable.$inferSelect;
