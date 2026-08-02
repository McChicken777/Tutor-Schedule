import { pgTable, text, serial, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teachersTable } from "./teachers";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  hasSeenTour: boolean("has_seen_tour").notNull().default(false),
  // Nullable permanently: a brand-new student can hit /student/me before ever
  // booking a lesson, at which point there's no teacher to assign yet. Set on
  // first booking (adopt-on-first-booking in POST /student/bookings).
  teacherId: integer("teacher_id").references(() => teachersTable.id),
  isBanned: boolean("is_banned").notNull().default(false),
  bannedAt: timestamp("banned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
