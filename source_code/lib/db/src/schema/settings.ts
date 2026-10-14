import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const platformSettingsTable = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull().default("Hall Booking Platform"),
  companyNameAr: text("company_name_ar").default("منصة حجز القاعات"),
  logoUrl: text("logo_url"),
  footerText: text("footer_text"),
  footerTextAr: text("footer_text_ar"),
  primaryColor: text("primary_color").default("#1e40af"),
  defaultLanguage: text("default_language").notNull().default("ar"),
  workingHoursStart: text("working_hours_start").notNull().default("07:00"),
  workingHoursEnd: text("working_hours_end").notNull().default("15:00"),
  passwordMinLength: integer("password_min_length").notNull().default(6),
  passwordRequireSpecial: boolean("password_require_special").notNull().default(false),
  passwordExpiryDays: integer("password_expiry_days"),
  overdueRequestHours: integer("overdue_request_hours").notNull().default(24),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  /** Advanced platform options (identity, booking rules, display, print…) — see api-server/src/lib/options.ts */
  options: jsonb("options").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const holidaysTable = pgTable("holidays", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSettingsSchema = createInsertSchema(platformSettingsTable).omit({ id: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type PlatformSettings = typeof platformSettingsTable.$inferSelect;
