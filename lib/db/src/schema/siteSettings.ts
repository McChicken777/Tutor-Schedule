import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const siteSettingsTable = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  tutorName: text("tutor_name").notNull().default("Your Tutor"),
  tutorBio: text("tutor_bio").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  freeTrialEnabled: boolean("free_trial_enabled").notNull().default(false),
  tutorPhotoUrl: text("tutor_photo_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSiteSettingsSchema = createInsertSchema(siteSettingsTable).omit({ id: true });
export type InsertSiteSettings = z.infer<typeof insertSiteSettingsSchema>;
export type SiteSettings = typeof siteSettingsTable.$inferSelect;
