import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notificationTypeEnum = pgEnum("notification_type", [
  "booking_approved",
  "booking_rejected",
  "booking_cancelled",
  "booking_pending",
  "system",
  "general",
]);

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  titleAr: text("title_ar"),
  message: text("message").notNull(),
  messageAr: text("message_ar"),
  type: notificationTypeEnum("type").notNull().default("general"),
  relatedBookingId: integer("related_booking_id"),
  isRead: boolean("is_read").notNull().default(false),
  /** Set on notifications sent manually (broadcast); groups one send operation. */
  batchId: text("batch_id"),
  sentBy: integer("sent_by"),
  /** The recipient removed it from their own inbox (other accounts are unaffected). */
  deletedAt: timestamp("deleted_at"),
  /** The sender removed this send from their own "sent" history. */
  senderHiddenAt: timestamp("sender_hidden_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
