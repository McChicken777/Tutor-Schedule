import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { teachersTable } from "./teachers";

export const calendarTokensTable = pgTable("calendar_tokens", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").references(() => teachersTable.id).unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiry: timestamp("token_expiry", { withTimezone: true }),
  calendarEmail: text("calendar_email"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
