import { pgTable, serial, text, integer, real, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const hallStatusEnum = pgEnum("hall_status", ["available", "maintenance", "disabled"]);

export const hallsTable = pgTable("halls", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  location: text("location").notNull(),
  locationAr: text("location_ar"),
  capacity: integer("capacity").notNull(),
  floor: text("floor"),
  building: text("building"),
  referenceCode: text("reference_code").notNull().unique(),
  status: hallStatusEnum("status").notNull().default("available"),
  equipment: text("equipment").array().notNull().default([]),
  providesHospitality: boolean("provides_hospitality").notNull().default(false),
  images: text("images").array().notNull().default([]),
  latitude: real("latitude"),
  longitude: real("longitude"),
  qrCode: text("qr_code"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertHallSchema = createInsertSchema(hallsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHall = z.infer<typeof insertHallSchema>;
export type Hall = typeof hallsTable.$inferSelect;
