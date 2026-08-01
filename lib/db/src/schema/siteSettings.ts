import { pgTable, text, serial, boolean, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teachersTable } from "./teachers";

export type DayHours = { enabled: boolean; start: string; end: string }; // start/end as "HH:mm", 24h
export type WeeklyHours = {
  mon: DayHours;
  tue: DayHours;
  wed: DayHours;
  thu: DayHours;
  fri: DayHours;
  sat: DayHours;
  sun: DayHours;
};

const defaultDayHours: DayHours = { enabled: true, start: "09:00", end: "20:00" };
export const DEFAULT_WEEKLY_HOURS: WeeklyHours = {
  mon: { ...defaultDayHours },
  tue: { ...defaultDayHours },
  wed: { ...defaultDayHours },
  thu: { ...defaultDayHours },
  fri: { ...defaultDayHours },
  sat: { ...defaultDayHours },
  sun: { ...defaultDayHours },
};

export const siteSettingsTable = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").references(() => teachersTable.id).unique(),
  tutorName: text("tutor_name").notNull().default("Your Tutor"),
  tutorBio: text("tutor_bio").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  freeTrialEnabled: boolean("free_trial_enabled").notNull().default(false),
  tutorPhotoUrl: text("tutor_photo_url"),
  weeklyHours: jsonb("weekly_hours").$type<WeeklyHours>().notNull().default(DEFAULT_WEEKLY_HOURS),
  // IANA timezone the tutor's weekly hours are expressed in (e.g. "Europe/Madrid").
  // All availability is generated in this zone, then stored/served as absolute
  // UTC instants so each student sees times in their own browser timezone.
  timezone: text("timezone").notNull().default("UTC"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSiteSettingsSchema = createInsertSchema(siteSettingsTable).omit({ id: true });
export type InsertSiteSettings = z.infer<typeof insertSiteSettingsSchema>;
export type SiteSettings = typeof siteSettingsTable.$inferSelect;
