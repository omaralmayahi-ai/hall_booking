import { pgTable, serial, text, integer, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { hallsTable } from "./halls";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const maintenanceCategoryEnum = pgEnum("maintenance_category", [
  "electrical",
  "plumbing",
  "hvac",
  "furniture",
  "technology",
  "cleaning",
  "structural",
  "other",
]);

export const maintenancePriorityEnum = pgEnum("maintenance_priority", ["low", "medium", "high", "urgent"]);

export const maintenanceStatusEnum = pgEnum("maintenance_status", [
  "pending",
  "in_progress",
  "resolved",
]);

export const maintenanceNotesTable = pgTable("maintenance_notes", {
  id: serial("id").primaryKey(),
  hallId: integer("hall_id").notNull().references(() => hallsTable.id),
  category: maintenanceCategoryEnum("category").notNull(),
  priority: maintenancePriorityEnum("priority").notNull(),
  status: maintenanceStatusEnum("status").notNull().default("pending"),
  description: text("description").notNull(),
  scheduledDate: timestamp("scheduled_date"),
  lastReminderSentAt: timestamp("last_reminder_sent_at"),
  resolvedAt: timestamp("resolved_at"),
  title: text("title"),
  assetId: integer("asset_id"),
  scheduleId: integer("schedule_id"),
  /** When true the hall cannot be booked while this note is open (whole period, or the block window below). */
  blocksHall: boolean("blocks_hall").notNull().default(false),
  blockStartDate: text("block_start_date"),
  blockEndDate: text("block_end_date"),
  blockStartTime: text("block_start_time"),
  blockEndTime: text("block_end_time"),
  /** The note switched the hall to "maintenance" — restore it when resolved. */
  hallStatusSet: boolean("hall_status_set").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMaintenanceNoteSchema = createInsertSchema(maintenanceNotesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMaintenanceNote = z.infer<typeof insertMaintenanceNoteSchema>;
export type MaintenanceNote = typeof maintenanceNotesTable.$inferSelect;
