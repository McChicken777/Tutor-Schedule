import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const lessonTypesTable = pgTable("lesson_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  priceCents: integer("price_cents").notNull(),
  description: text("description").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isTrial: boolean("is_trial").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLessonTypeSchema = createInsertSchema(lessonTypesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLessonType = z.infer<typeof insertLessonTypeSchema>;
export type LessonType = typeof lessonTypesTable.$inferSelect;
