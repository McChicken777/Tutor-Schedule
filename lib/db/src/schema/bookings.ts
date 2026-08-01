import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { lessonTypesTable } from "./lessonTypes";
import { teachersTable } from "./teachers";

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id),
  lessonTypeId: integer("lesson_type_id").notNull().references(() => lessonTypesTable.id),
  teacherId: integer("teacher_id").references(() => teachersTable.id),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("upcoming"), // upcoming | completed | cancelled
  meetLink: text("meet_link"),
  calendarEventId: text("calendar_event_id"),
  cancellationReason: text("cancellation_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
