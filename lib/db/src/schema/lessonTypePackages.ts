import { pgTable, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lessonTypesTable } from "./lessonTypes";

// A bulk offer for one lesson type: "10 × 55min for €139.99". The teacher
// defines these; a student requests one, pays the teacher directly off the
// platform, and the teacher marks the request paid, which grants the lessons.
//
// Priced as a TOTAL rather than per lesson, so the teacher types the exact
// figure the student pays (€139.99) instead of one derived from a per-lesson
// rate that may not divide evenly. The per-lesson equivalent is computed for
// display only.
export const lessonTypePackagesTable = pgTable("lesson_type_packages", {
  id: serial("id").primaryKey(),
  lessonTypeId: integer("lesson_type_id")
    .references(() => lessonTypesTable.id, { onDelete: "cascade" })
    .notNull(),
  quantity: integer("quantity").notNull(),
  totalCents: integer("total_cents").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertLessonTypePackageSchema = createInsertSchema(lessonTypePackagesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLessonTypePackage = z.infer<typeof insertLessonTypePackageSchema>;
export type LessonTypePackage = typeof lessonTypePackagesTable.$inferSelect;
