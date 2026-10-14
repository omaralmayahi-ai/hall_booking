import { and, eq, isNotNull, lte, ne, or, isNull, lt } from "drizzle-orm";
import { db, maintenanceNotesTable, notificationsTable, usersTable } from "@workspace/db";
import { logger } from "./logger";

const REMINDER_WINDOW_DAYS = 3;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function runMaintenanceReminderCheck(): Promise<void> {
  const windowEnd = new Date(Date.now() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const today = startOfToday();

  const dueNotes = await db
    .select()
    .from(maintenanceNotesTable)
    .where(
      and(
        ne(maintenanceNotesTable.status, "resolved" as any),
        isNotNull(maintenanceNotesTable.scheduledDate),
        lte(maintenanceNotesTable.scheduledDate, windowEnd),
        or(isNull(maintenanceNotesTable.lastReminderSentAt), lt(maintenanceNotesTable.lastReminderSentAt, today)),
      ),
    );

  if (dueNotes.length === 0) return;

  const managers = await db.select().from(usersTable).where(eq(usersTable.role, "relations_manager" as any));
  if (managers.length === 0) return;

  for (const note of dueNotes) {
    const dueDateStr = note.scheduledDate ? new Date(note.scheduledDate).toLocaleDateString("ar-IQ-u-nu-latn") : "";
    for (const manager of managers) {
      await db.insert(notificationsTable).values({
        userId: manager.id,
        title: "Maintenance Reminder",
        titleAr: "تذكير بموعد صيانة",
        message: `Maintenance scheduled for ${dueDateStr} is approaching`,
        messageAr: `اقترب موعد الصيانة المجدول بتاريخ ${dueDateStr}`,
        type: "general",
      });
    }
    await db.update(maintenanceNotesTable).set({ lastReminderSentAt: new Date() }).where(eq(maintenanceNotesTable.id, note.id));
  }

  logger.info({ count: dueNotes.length }, "Sent maintenance schedule reminders");
}

export function startMaintenanceReminderJob(): void {
  runMaintenanceReminderCheck().catch((err) => logger.error({ err }, "Maintenance reminder check failed"));
  setInterval(() => {
    runMaintenanceReminderCheck().catch((err) => logger.error({ err }, "Maintenance reminder check failed"));
  }, CHECK_INTERVAL_MS);
}
