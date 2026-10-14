import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, reviewsTable, bookingsTable, usersTable } from "@workspace/db";
import { CreateReviewParams, CreateReviewBody, ListHallReviewsParams } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/bookings/:id/review", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = CreateReviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, params.data.id));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (booking.userId !== req.user!.id) {
    res.status(403).json({ error: "يمكن تقييم حجوزاتك فقط" });
    return;
  }
  if (!["completed", "approved", "partially_approved"].includes(booking.status)) {
    res.status(409).json({ error: "يمكن التقييم بعد انعقاد الحجز فقط" });
    return;
  }
  const [already] = await db.select({ id: reviewsTable.id }).from(reviewsTable).where(eq(reviewsTable.bookingId, booking.id));
  if (already) {
    res.status(409).json({ error: "تم تقييم هذا الحجز مسبقاً" });
    return;
  }
  for (const r of [parsed.data.cleanlinessRating, parsed.data.equipmentRating, parsed.data.cateringRating]) {
    if (r != null && (r < 1 || r > 5)) {
      res.status(400).json({ error: "التقييم يجب أن يكون بين 1 و 5" });
      return;
    }
  }
  const ratings = [parsed.data.cleanlinessRating, parsed.data.equipmentRating, parsed.data.cateringRating].filter(Boolean) as number[];
  const overall = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const [review] = await db.insert(reviewsTable).values({
    bookingId: params.data.id,
    userId: req.user!.id,
    hallId: booking.hallId,
    cleanlinessRating: parsed.data.cleanlinessRating,
    equipmentRating: parsed.data.equipmentRating,
    cateringRating: parsed.data.cateringRating,
    overallRating: overall,
    comment: parsed.data.comment?.slice(0, 2000),
  }).returning();
  res.status(201).json({ ...review, createdAt: review.createdAt.toISOString() });
});

router.get("/halls/:id/reviews", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = ListHallReviewsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select({ review: reviewsTable, user: usersTable })
    .from(reviewsTable)
    .leftJoin(usersTable, eq(reviewsTable.userId, usersTable.id))
    .where(eq(reviewsTable.hallId, params.data.id));
  res.json(rows.map(({ review, user }) => {
    return {
      ...review,
      user: user ? { id: user.id, username: user.username, departmentName: user.departmentName, role: user.role } : null,
      createdAt: review.createdAt.toISOString(),
    };
  }));
});

export default router;
