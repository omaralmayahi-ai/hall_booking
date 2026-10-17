import { useEffect, useState } from "react";
import { useSearch } from "wouter";

/**
 * The notifications page opened from the bell (…/notifications?n=<id>):
 * returns that id, scrolls it into view and keeps it highlighted.
 */
export function useFocusedNotification(ready: boolean): number | null {
  const search = useSearch();
  const id = Number(new URLSearchParams(search).get("n")) || null;
  const [focused, setFocused] = useState<number | null>(id);
  useEffect(() => setFocused(id), [id]);
  useEffect(() => {
    if (!ready || !focused) return;
    const t = setTimeout(() => {
      document.getElementById(`notif-${focused}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(t);
  }, [ready, focused]);
  return focused;
}

/** Where "عرض الحجز" on a notification leads, by role. */
export function bookingLinkFor(role: string | undefined, bookingId: number | null | undefined): string | null {
  if (!bookingId) return null;
  if (role === "relations_manager") return `/manager/bookings?booking=${bookingId}`;
  if (role === "requesting_department") return `/department/bookings?booking=${bookingId}`;
  return null;
}
