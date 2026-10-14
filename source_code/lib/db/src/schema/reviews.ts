import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { hallsTable } from "./halls";
import { bookingsTable } from "./bookings";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id).unique(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  hallId: integer("hall_id").notNull().references(() => hallsTable.id),
  cleanlinessRating: integer("cleanliness_rating"),
  equipmentRating: integer("equipment_rating"),
  cateringRating: integer("catering_rating"),
  overallRating: real("overall_rating"),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertReviewSchema = createInsertSchema(reviewsTable).omit({ id: true, createdAt: true });
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviewsTable.$inferSelect;
