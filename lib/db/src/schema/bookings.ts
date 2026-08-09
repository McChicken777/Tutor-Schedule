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
  teacherId: integer("teacher_id").references(() => teachersTable.id).notNull(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("upcoming"), // upcoming | completed | cancelled
  meetLink: text("meet_link"),
  calendarEventId: text("calendar_event_id"),
  cancellationReason: text("cancellation_reason"),
  notes: text("notes"),
  // How this lesson was paid for.
  //   balance — drawn from a package the student already paid for
  //   unpaid  — booked as a one-off; the student owes for it
  //   paid    — one-off the teacher has confirmed payment for
  //   free    — trial lesson, nothing owed
  // Only "unpaid" needs the teacher's attention, so it drives the amount-owed
  // view rather than a separate invoice concept.
  paymentStatus: text("payment_status").notNull().default("balance"),
  // Charged amount for one-off bookings, copied from the lesson type at booking
  // time so a later price change can't rewrite what the student owes.
  priceCents: integer("price_cents").notNull().default(0),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  // Idempotency flag for the upcoming-class-reminder push sweep, mirroring homework's
  // reminderSentAt pattern — set once the reminder push has fired so the sweep never double-sends.
  classReminderSentAt: timestamp("class_reminder_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
