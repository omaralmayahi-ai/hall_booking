import { Router, type IRouter } from "express";
import { eq, and, SQL } from "drizzle-orm";
import { db, maintenanceNotesTable, maintenanceSchedulesTable, hallsTable, hallAssetsTable, bookingsTable, usersTable } from "@workspace/db";
import {
  ListMaintenanceNotesQueryParams,
  CreateMaintenanceNoteBody,
  UpdateMaintenanceNoteParams,
  UpdateMaintenanceNoteBody,
  DeleteMaintenanceNoteParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { logAudit, clientIp } from "../lib/auth";
import { isValidDate, isValidTime, hhmm } from "../lib/time";
import { getOptions } from "../lib/options";
import {
  applyHallBlock,
  releaseHallBlock,
  findAffectedBookings,
  notifyAffected,
  suggestAlternatives,
  syncAssetStatus,
} from "../lib/maintenance-impact";
import { runScheduledMaintenance } from "../lib/jobs";

const router: IRouter = Router();

export const MAINTENANCE_CATEGORIES = ["electrical", "plumbing", "hvac", "furniture", "technology", "cleaning", "structural", "other"] as const;

type Note = typeof maintenanceNotesTable.$inferSelect;

function serializeNote(n: Note) {
  return {
    ...n,
    scheduledDate: n.scheduledDate?.toISOString() ?? null,
    resolvedAt: n.resolvedAt?.toISOString() ?? null,
    lastReminderSentAt: n.lastReminderSentAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

type BlockFields = Pick<Note, "blocksHall" | "blockStartDate" | "blockEndDate" | "blockStartTime" | "blockEndTime"> & {
  title?: string | null;
  assetId?: number | null;
};

/** Parse the v2 fields (blocking window, asset, title). Returns an error string when invalid. */
async function readBlockFields(body: any, hallId: number, partial: boolean): Promise<Partial<BlockFields> | string> {
  const out: Partial<BlockFields> = {};
  if (!body || typeof body !== "object") return out;
  if ("title" in body) out.title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 150) : null;
  if ("assetId" in body) {
    if (body.assetId === null || body.assetId === "" || body.assetId === undefined) out.assetId = null;
    else {
      const id = Number(body.assetId);
      const [asset] = Number.isInteger(id) ? await db.select().from(hallAssetsTable).where(eq(hallAssetsTable.id, id)) : [];
      if (!asset || asset.hallId !== hallId) return "المادة المحددة لا تعود لهذه القاعة";
      out.assetId = id;
    }
  }
  if ("blocksHall" in body) out.blocksHall = body.blocksHall === true;
  const hasWindow = ["blockStartDate", "blockEndDate", "blockStartTime", "blockEndTime"].some((k) => k in body);
  if (hasWindow || !partial) {
    const sd = body.blockStartDate || null;
    const ed = body.blockEndDate || sd;
    const st = body.blockStartTime ? String(body.blockStartTime).slice(0, 5) : null;
    const et = body.blockEndTime ? String(body.blockEndTime).slice(0, 5) : null;
    if (sd && (!isValidDate(sd) || !isValidDate(ed) || ed < sd)) return "فترة حجب القاعة غير صحيحة";
    if ((st && !isValidTime(st)) || (et && !isValidTime(et)) || (!!st !== !!et)) return "حدد وقتي بداية ونهاية الحجب معاً أو اتركهما فارغين ليشمل اليوم كاملاً";
    if (st && et && hhmm(et) <= hhmm(st)) return "وقت نهاية الحجب يجب أن يكون بعد بدايته";
    out.blockStartDate = sd;
    out.blockEndDate = sd ? ed : null;
    out.blockStartTime = sd ? st : null;
    out.blockEndTime = sd ? et : null;
  }
  return out;
}

async function impactReport(note: Note, hallBlocked: boolean) {
  if (!note.blocksHall || note.status === "resolved") return { hallBlocked, affected: [] };
  const affected = await findAffectedBookings(note);
  const report = await notifyAffected(note, affected);
  return { hallBlocked, affected: await describeBookings(affected, report) };
}

async function describeBookings(
  bookings: (typeof bookingsTable.$inferSelect)[],
  report: { bookingId: number; alternatives: { id: number; name: string; capacity: number; location: string }[] }[],
) {
  const users = await db.select({ id: usersTable.id, departmentName: usersTable.departmentName, username: usersTable.username }).from(usersTable);
  return bookings.map((b) => {
    const u = users.find((x) => x.id === b.userId);
    return {
      id: b.id,
      status: b.status,
      startDate: b.startDate,
      endDate: b.endDate,
      startTime: hhmm(b.startTime),
      endTime: hhmm(b.endTime),
      isRecurring: b.isRecurring,
      recurringWeeks: b.recurringWeeks,
      activityType: b.activityType,
      attendees: b.attendees,
      department: b.manualDepartmentName || u?.departmentName || u?.username || "",
      alternatives: report.find((r) => r.bookingId === b.id)?.alternatives ?? [],
    };
  });
}

/* ------------------------------------------------------------------ */
/* Preventive maintenance schedules                                    */
/* ------------------------------------------------------------------ */

function readSchedule(body: any, partial: boolean): Partial<typeof maintenanceSchedulesTable.$inferInsert> | string {
  const out: Partial<typeof maintenanceSchedulesTable.$inferInsert> = {};
  if (!body || typeof body !== "object") return "بيانات غير صالحة";
  if (!partial || "title" in body) {
    if (typeof body.title !== "string" || !body.title.trim()) return "يرجى إدخال عنوان الصيانة الدورية";
    out.title = body.title.trim().slice(0, 150);
  }
  if (!partial || "hallId" in body) {
    const id = Number(body.hallId);
    if (!Number.isInteger(id) || id < 1) return "يرجى اختيار القاعة";
    out.hallId = id;
  }
  if (!partial || "intervalDays" in body) {
    const n = Number(body.intervalDays);
    if (!Number.isInteger(n) || n < 1 || n > 730) return "مدة التكرار يجب أن تكون بين 1 و 730 يوماً";
    out.intervalDays = n;
  }
  if (!partial || "nextDueDate" in body) {
    if (!isValidDate(body.nextDueDate)) return "تاريخ الاستحقاق القادم غير صحيح";
    out.nextDueDate = body.nextDueDate;
  }
  if ("category" in body) out.category = (MAINTENANCE_CATEGORIES as readonly string[]).includes(body.category) ? body.category : "other";
  if ("leadDays" in body) {
    const n = Number(body.leadDays);
    if (!Number.isInteger(n) || n < 0 || n > 60) return "مدة الإنشاء المسبق يجب أن تكون بين 0 و 60 يوماً";
    out.leadDays = n;
  }
  if ("blocksHall" in body) out.blocksHall = body.blocksHall === true;
  if ("isActive" in body) out.isActive = body.isActive !== false;
  if ("notes" in body) out.notes = typeof body.notes === "string" ? body.notes.slice(0, 1000) : null;
  if ("assetId" in body) out.assetId = body.assetId ? Number(body.assetId) || null : null;
  if ("blockStartTime" in body || "blockEndTime" in body) {
    const st = body.blockStartTime ? String(body.blockStartTime).slice(0, 5) : null;
    const et = body.blockEndTime ? String(body.blockEndTime).slice(0, 5) : null;
    if ((st && !isValidTime(st)) || (et && !isValidTime(et)) || !!st !== !!et || (st && et && et <= st)) return "أوقات الحجب غير صحيحة";
    out.blockStartTime = st;
    out.blockEndTime = et;
  }
  return out;
}

const serializeSchedule = (s: typeof maintenanceSchedulesTable.$inferSelect) => ({
  ...s,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
});

router.get("/maintenance/schedules", requireAuth, requireRole("relations_manager"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(maintenanceSchedulesTable).orderBy(maintenanceSchedulesTable.nextDueDate);
  res.json(rows.map(serializeSchedule));
});

router.post("/maintenance/schedules", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const data = readSchedule(req.body, false);
  if (typeof data === "string") {
    res.status(400).json({ error: data });
    return;
  }
  const [hall] = await db.select({ id: hallsTable.id }).from(hallsTable).where(eq(hallsTable.id, data.hallId!));
  if (!hall) {
    res.status(404).json({ error: "القاعة غير موجودة" });
    return;
  }
  const [row] = await db.insert(maintenanceSchedulesTable).values(data as typeof maintenanceSchedulesTable.$inferInsert).returning();
  await logAudit(req.user!.id, req.user!.username, "create_maintenance_schedule", "maintenance_schedule", row.id, row.title, clientIp(req));
  await runScheduledMaintenance();
  const [fresh] = await db.select().from(maintenanceSchedulesTable).where(eq(maintenanceSchedulesTable.id, row.id));
  res.status(201).json(serializeSchedule(fresh));
});

router.patch("/maintenance/schedules/:id", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Number(req.params.id);
  const data = readSchedule(req.body, true);
  if (typeof data === "string") {
    res.status(400).json({ error: data });
    return;
  }
  const [row] = await db
    .update(maintenanceSchedulesTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(maintenanceSchedulesTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "غير موجود" });
    return;
  }
  await logAudit(req.user!.id, req.user!.username, "update_maintenance_schedule", "maintenance_schedule", row.id, undefined, clientIp(req));
  await runScheduledMaintenance();
  res.json(serializeSchedule(row));
});

router.delete("/maintenance/schedules/:id", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(maintenanceSchedulesTable).where(eq(maintenanceSchedulesTable.id, id));
  await logAudit(req.user!.id, req.user!.username, "delete_maintenance_schedule", "maintenance_schedule", id, undefined, clientIp(req));
  res.sendStatus(204);
});

/* ------------------------------------------------------------------ */
/* Maintenance notes                                                   */
/* ------------------------------------------------------------------ */

router.get("/maintenance", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = ListMaintenanceNotesQueryParams.safeParse(req.query);
  const conditions: SQL[] = [];
  if (params.success) {
    if (params.data.hallId) conditions.push(eq(maintenanceNotesTable.hallId, params.data.hallId));
    if (params.data.status) conditions.push(eq(maintenanceNotesTable.status, params.data.status as any));
  }
  const notes = conditions.length
    ? await db.select().from(maintenanceNotesTable).where(and(...conditions))
    : await db.select().from(maintenanceNotesTable);
  notes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  res.json(notes.map(serializeNote));
});

router.post("/maintenance", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateMaintenanceNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات الصيانة غير مكتملة" });
    return;
  }
  const [hall] = await db.select({ id: hallsTable.id }).from(hallsTable).where(eq(hallsTable.id, parsed.data.hallId));
  if (!hall) {
    res.status(404).json({ error: "القاعة غير موجودة" });
    return;
  }
  const extra = await readBlockFields(req.body, parsed.data.hallId, false);
  if (typeof extra === "string") {
    res.status(400).json({ error: extra });
    return;
  }
  if (extra.blocksHall === undefined) {
    const m = (await getOptions()).maintenance;
    extra.blocksHall = (parsed.data.priority === "urgent" && m.urgentBlocksHall) || (parsed.data.priority === "high" && m.highBlocksHall);
  }
  const [note] = await db.insert(maintenanceNotesTable).values({
    hallId: parsed.data.hallId,
    category: parsed.data.category as any,
    priority: parsed.data.priority as any,
    description: parsed.data.description,
    scheduledDate: parsed.data.scheduledDate ? new Date(parsed.data.scheduledDate) : null,
    ...extra,
  }).returning();
  await logAudit(req.user!.id, req.user!.username, "create_maintenance", "maintenance", note.id, undefined, clientIp(req));
  const hallBlocked = await applyHallBlock(note);
  await syncAssetStatus(note);
  const impact = await impactReport(note, hallBlocked);
  const [fresh] = await db.select().from(maintenanceNotesTable).where(eq(maintenanceNotesTable.id, note.id));
  res.status(201).json({ ...serializeNote(fresh), impact });
});

router.get("/maintenance/:id/affected", requireAuth, requireRole("relations_manager"), async (req, res): Promise<void> => {
  const [note] = await db.select().from(maintenanceNotesTable).where(eq(maintenanceNotesTable.id, Number(req.params.id)));
  if (!note) {
    res.status(404).json({ error: "غير موجود" });
    return;
  }
  if (!note.blocksHall || note.status === "resolved") {
    res.json([]);
    return;
  }
  const affected = await findAffectedBookings(note);
  const report = [];
  for (const b of affected) report.push({ bookingId: b.id, alternatives: await suggestAlternatives(b) });
  res.json(await describeBookings(affected, report));
});

router.patch("/maintenance/:id", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateMaintenanceNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateMaintenanceNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صالحة" });
    return;
  }
  const [existing] = await db.select().from(maintenanceNotesTable).where(eq(maintenanceNotesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Note not found" });
    return;
  }
  const extra = await readBlockFields(req.body, existing.hallId, true);
  if (typeof extra === "string") {
    res.status(400).json({ error: extra });
    return;
  }
  const resolvedAt = parsed.data.status === "resolved" && existing.status !== "resolved" ? new Date() : parsed.data.status && parsed.data.status !== "resolved" ? null : existing.resolvedAt;
  const { scheduledDate, ...restData } = parsed.data;
  const [updated] = await db.update(maintenanceNotesTable).set({
    ...restData,
    ...extra,
    category: (parsed.data.category as any) ?? existing.category,
    priority: (parsed.data.priority as any) ?? existing.priority,
    status: (parsed.data.status as any) ?? existing.status,
    scheduledDate: scheduledDate !== undefined ? (scheduledDate ? new Date(scheduledDate) : null) : existing.scheduledDate,
    resolvedAt,
    updatedAt: new Date(),
  }).where(eq(maintenanceNotesTable.id, params.data.id)).returning();
  await logAudit(req.user!.id, req.user!.username, "update_maintenance", "maintenance", updated.id, parsed.data.status, clientIp(req));

  let hallReleased = false;
  let hallBlocked = false;
  const stillBlocking = updated.blocksHall && updated.status !== "resolved" && !updated.blockStartDate;
  if (!stillBlocking && existing.hallStatusSet) hallReleased = await releaseHallBlock({ ...updated, hallStatusSet: true });
  else if (stillBlocking && !existing.hallStatusSet) hallBlocked = await applyHallBlock(updated);
  if (updated.status !== existing.status || updated.assetId !== existing.assetId) await syncAssetStatus(updated);

  const becameBlocking =
    updated.blocksHall && updated.status !== "resolved" &&
    (!existing.blocksHall || existing.status === "resolved" ||
      existing.blockStartDate !== updated.blockStartDate || existing.blockEndDate !== updated.blockEndDate ||
      existing.blockStartTime !== updated.blockStartTime || existing.blockEndTime !== updated.blockEndTime);
  const impact = becameBlocking ? await impactReport(updated, hallBlocked) : { hallBlocked, affected: [] };
  const [fresh] = await db.select().from(maintenanceNotesTable).where(eq(maintenanceNotesTable.id, updated.id));
  res.json({ ...serializeNote(fresh), impact: { ...impact, hallReleased } });
});

router.delete("/maintenance/:id", requireAuth, requireRole("relations_manager"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = DeleteMaintenanceNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db.select().from(maintenanceNotesTable).where(eq(maintenanceNotesTable.id, params.data.id));
  if (existing?.hallStatusSet) await releaseHallBlock(existing);
  await db.delete(maintenanceNotesTable).where(eq(maintenanceNotesTable.id, params.data.id));
  if (existing?.assetId) await syncAssetStatus({ ...existing, status: "resolved" });
  await logAudit(req.user!.id, req.user!.username, "delete_maintenance", "maintenance", params.data.id, undefined, clientIp(req));
  res.sendStatus(204);
});


export default router;
