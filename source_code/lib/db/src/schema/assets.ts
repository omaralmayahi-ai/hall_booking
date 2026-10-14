import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { hallsTable } from "./halls";

/** Inventory of a hall's contents (projectors, sound systems, chairs, AC units…). */
export const hallAssetsTable = pgTable("hall_assets", {
  id: serial("id").primaryKey(),
  hallId: integer("hall_id").notNull().references(() => hallsTable.id),
  name: text("name").notNull(),
  category: text("category").notNull().default("other"),
  inventoryNo: text("inventory_no"),
  serialNo: text("serial_no"),
  quantity: integer("quantity").notNull().default(1),
  /** working | needs_repair | out_of_service */
  status: text("status").notNull().default("working"),
  /** Can be requested by a department when booking the hall. */
  isRequestable: boolean("is_requestable").notNull().default(true),
  lastCheckedAt: text("last_checked_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Recurring preventive maintenance (e.g. AC inspection every 90 days). */
export const maintenanceSchedulesTable = pgTable("maintenance_schedules", {
  id: serial("id").primaryKey(),
  hallId: integer("hall_id").notNull().references(() => hallsTable.id),
  assetId: integer("asset_id"),
  title: text("title").notNull(),
  category: text("category").notNull().default("other"),
  intervalDays: integer("interval_days").notNull(),
  nextDueDate: text("next_due_date").notNull(),
  /** Create the task this many days before it is due. */
  leadDays: integer("lead_days").notNull().default(7),
  blocksHall: boolean("blocks_hall").notNull().default(false),
  blockStartTime: text("block_start_time"),
  blockEndTime: text("block_end_time"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type HallAsset = typeof hallAssetsTable.$inferSelect;
export type MaintenanceSchedule = typeof maintenanceSchedulesTable.$inferSelect;
