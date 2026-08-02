import { pgTable, text, serial, timestamp, integer, AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { homeworkTable } from "./homework";

export const homeworkFilesTable = pgTable("homework_files", {
  id: serial("id").primaryKey(),
  homeworkId: integer("homework_id").notNull().references(() => homeworkTable.id, { onDelete: "cascade" }),
  slot: text("slot").notNull(), // "assigned" | "submission" | "review"
  key: text("key").notNull(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  url: text("url"),
  linkedFileId: integer("linked_file_id").references((): AnyPgColumn => homeworkFilesTable.id, { onDelete: "set null" }),
  originalFileId: integer("original_file_id").references((): AnyPgColumn => homeworkFilesTable.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insertHomeworkFileSchema = createInsertSchema(homeworkFilesTable).omit({ id: true, createdAt: true });
export type InsertHomeworkFile = z.infer<typeof insertHomeworkFileSchema>;
export type HomeworkFile = typeof homeworkFilesTable.$inferSelect;
