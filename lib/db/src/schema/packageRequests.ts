import { pgTable, serial, timestamp, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { teachersTable } from "./teachers";
import { lessonTypesTable } from "./lessonTypes";
import { lessonTypePackagesTable } from "./lessonTypePackages";

// A student asking to buy a package. Payment happens off the platform —
// bank transfer, cash, whatever the teacher and student already do — so this
// row is the record of the request and, once the teacher confirms the money
// arrived, the trigger that grants the lessons.
//
// quantity and priceCents are copied off the package at request time rather
// than joined, so that later edits to the offer can't retroactively change
// what was agreed.
export const packageRequestsTable = pgTable("package_requests", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").references(() => usersTable.id).notNull(),
  teacherId: integer("teacher_id").references(() => teachersTable.id).notNull(),
  lessonTypeId: integer("lesson_type_id").references(() => lessonTypesTable.id).notNull(),
  // Null if the offer was deleted after the request was made.
  lessonTypePackageId: integer("lesson_type_package_id").references(
    () => lessonTypePackagesTable.id,
    { onDelete: "set null" },
  ),
  quantity: integer("quantity").notNull(),
  totalCents: integer("total_cents").notNull(),
  status: text("status").notNull().default("pending"), // pending | paid | declined
  note: text("note"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertPackageRequestSchema = createInsertSchema(packageRequestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPackageRequest = z.infer<typeof insertPackageRequestSchema>;
export type PackageRequest = typeof packageRequestsTable.$inferSelect;
