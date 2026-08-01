import { pgTable, text, serial, timestamp, integer, AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { testHomeworkTable } from "./testHomework";

export const testHomeworkFilesTable = pgTable("test_homework_files", {
  id: serial("id").primaryKey(),
  testHomeworkId: integer("test_homework_id").notNull().references(() => testHomeworkTable.id, { onDelete: "cascade" }),
  slot: text("slot").notNull(), // "assigned" | "submission" | "review"
  key: text("key").notNull(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  url: text("url"),
  linkedFileId: integer("linked_file_id").references((): AnyPgColumn => testHomeworkFilesTable.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTestHomeworkFileSchema = createInsertSchema(testHomeworkFilesTable).omit({ id: true, createdAt: true });
export type InsertTestHomeworkFile = z.infer<typeof insertTestHomeworkFileSchema>;
export type TestHomeworkFile = typeof testHomeworkFilesTable.$inferSelect;
