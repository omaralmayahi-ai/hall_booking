import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { randomBytes } from "node:crypto";
import { usersTable } from "./users";
import { hallsTable } from "./halls";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "approved",
  "partially_approved",
  "rejected",
  "cancelled",
  "emergency_cancelled",
  "completed",
]);

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  hallId: integer("hall_id").notNull().references(() => hallsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  status: bookingStatusEnum("status").notNull().default("pending"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  activityType: text("activity_type").notNull(),
  reason: text("reason").notNull(),
  notes: text("notes"),
  needsCatering: boolean("needs_catering").notNull().default(false),
  needsMeals: boolean("needs_meals").notNull().default(false),
  cateringApproved: boolean("catering_approved"),
  mealsApproved: boolean("meals_approved"),
  coordinatorName: text("coordinator_name"),
  coordinatorPhone: text("coordinator_phone"),
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurringWeeks: integer("recurring_weeks"),
  rejectionReason: text("rejection_reason"),
  cancellationReason: text("cancellation_reason"),
  approvedBy: integer("approved_by").references(() => usersTable.id),
  approverNote: text("approver_note"),
  manualDepartmentName: text("manual_department_name"),
  attendees: integer("attendees"),
  requestedItems: text("requested_items").array().notNull().default([]),
  seatingLayout: text("seating_layout"),
  /** Unguessable code printed on the booking slip (QR) for public verification. */
  publicCode: text("public_code").$defaultFn(() => randomBytes(9).toString("base64url")),
  /** Occurrence date (YYYY-MM-DD) the last reminder was sent for. */
  reminderSentFor: text("reminder_sent_for"),
  /** Finished / cancelled bookings moved out of the working lists (still counted in reports). */
  archivedAt: timestamp("archived_at"),
  archivedBy: integer("archived_by"),
  /** The department was invited to rate the hall after the booking ended. */
  reviewPrompted: boolean("review_prompted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const waitlistTable = pgTable("waitlist", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
