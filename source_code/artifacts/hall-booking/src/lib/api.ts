import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";

/**
 * Small typed client for the v2 endpoints (calendar, assets, reports, options…) that are not part of
 * the generated OpenAPI client. Same auth (Bearer token) and error type (ApiError) as the generated hooks,
 * so the global 401 handling in App.tsx keeps working.
 */
function authHeaders(json: boolean): HeadersInit {
  const token = localStorage.getItem("token");
  return {
    Accept: "application/json",
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `/api${path}`;
  const res = await fetch(url, {
    method,
    headers: authHeaders(body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = res.status === 204 ? "" : await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new ApiError(res, data, { method, url });
  return data as T;
}

/** Arabic error message from any API failure. */
export function errorMessage(e: unknown, fallback = "حدث خطأ غير متوقع"): string {
  const d = (e as { data?: { error?: string } })?.data;
  return d?.error || fallback;
}

export function useApiQuery<T>(path: string | null, options?: Partial<UseQueryOptions<T>>) {
  return useQuery<T>({
    queryKey: ["v2", path],
    queryFn: () => api<T>("GET", path!),
    enabled: !!path,
    ...options,
  });
}

/** Mutation that invalidates every v2 query (and optionally generated query keys) on success. */
export function useApiMutation<TBody = unknown, TResult = unknown>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string | ((body: TBody) => string),
  invalidate: string[] = [],
) {
  const qc = useQueryClient();
  return useMutation<TResult, unknown, TBody>({
    mutationFn: (body: TBody) => {
      const p = typeof path === "function" ? path(body) : path;
      return api<TResult>(method, p, method === "DELETE" ? undefined : body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["v2"] });
      for (const k of invalidate) qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

/** Download a binary export (Excel) with the session token and save it under `filename`. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const url = `/api${path}`;
  const res = await fetch(url, { headers: authHeaders(false) });
  if (!res.ok) {
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(res, data, { method: "GET", url });
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ------------------------------------------------------------------ */
/* Shared types                                                         */
/* ------------------------------------------------------------------ */

export interface CalendarEvent {
  id: string;
  type: "booking" | "maintenance";
  bookingId?: number | null;
  noteId?: number | null;
  hallId: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  title: string;
  department?: string | null;
  attendees?: number | null;
  mine: boolean;
}

export interface CalendarHall {
  id: number;
  name: string;
  status: string;
  capacity: number;
  location: string;
}

export interface CalendarData {
  from: string;
  to: string;
  events: CalendarEvent[];
  holidays: { date: string; name: string }[];
  halls: CalendarHall[];
  workingHoursStart: string;
  workingHoursEnd: string;
  weekendDays: number[];
  blockWeekends: boolean;
  today: string;
}

export interface HallAsset {
  id: number;
  hallId: number;
  hallName?: string;
  name: string;
  category: string;
  inventoryNo: string | null;
  serialNo: string | null;
  quantity: number;
  status: string;
  isRequestable: boolean;
  lastCheckedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceSchedule {
  id: number;
  hallId: number;
  assetId: number | null;
  title: string;
  category: string;
  intervalDays: number;
  nextDueDate: string;
  leadDays: number;
  blocksHall: boolean;
  blockStartTime: string | null;
  blockEndTime: string | null;
  isActive: boolean;
  notes: string | null;
}

export interface AffectedBooking {
  id: number;
  status: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  recurringWeeks: number | null;
  activityType: string;
  attendees: number | null;
  department: string;
  alternatives: { id: number; name: string; capacity: number; location: string }[];
}

export interface BookingSlip {
  id: number;
  status: string;
  publicCode: string;
  verifyUrl: string;
  qr: string;
  hall: { id: number; name: string; location: string; floor: string | null; building: string | null; capacity: number; referenceCode: string } | null;
  department: string;
  activityType: string;
  reason: string;
  notes: string | null;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  recurringWeeks: number | null;
  attendees: number | null;
  seatingLayout: string | null;
  requestedItems: string[];
  needsCatering: boolean;
  needsMeals: boolean;
  cateringApproved: boolean | null;
  mealsApproved: boolean | null;
  coordinatorName: string | null;
  coordinatorPhone: string | null;
  approverNote: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}
