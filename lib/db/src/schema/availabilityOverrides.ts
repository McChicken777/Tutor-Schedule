import { pgTable, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teachersTable } from "./teachers";

// A teacher-set block of time when lessons can't be booked, layered on top of
// the recurring weekly schedule (site_settings.weekly_hours). One row per
// contiguous blocked range; a whole day off is just a range covering that day.
export const availabilityOverridesTable = pgTable("availability_overrides", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").references(() => teachersTable.id).notNull(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAvailabilityOverrideSchema = createInsertSchema(availabilityOverridesTable).omit({ id: true, createdAt: true });
export type InsertAvailabilityOverride = z.infer<typeof insertAvailabilityOverrideSchema>;
export type AvailabilityOverride = typeof availabilityOverridesTable.$inferSelect;
