import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const calendarTokensTable = pgTable("calendar_tokens", {
  id: serial("id").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiry: timestamp("token_expiry", { withTimezone: true }),
  calendarEmail: text("calendar_email"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
