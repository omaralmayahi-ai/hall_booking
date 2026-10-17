import fs from "node:fs";
import path from "node:path";
import { rawSql, resolveDataDir } from "@workspace/db";
import { logger } from "./logger";
import { getOptions, type PlatformOptions } from "./options";

/**
 * Database backups: consistent snapshots of the embedded database (.tar.gz).
 *
 * - Folder: options.backup.directory, or <install>/backups next to the data folder.
 * - Kinds (from the file name): manual | scheduled | before-reset | before-restore | uploaded.
 * - Restore happens at the next start (lib/restore-pending.ts) — the running database
 *   cannot be swapped underneath itself — so the server restarts itself after scheduling it.
 */

export type BackupKind = "manual" | "scheduled" | "before-reset" | "before-restore" | "uploaded" | "legacy";
export interface BackupItem {
  name: string;
  kind: BackupKind;
  size: number;
  createdAt: string;
  restorable: boolean;
  location: "main" | "legacy";
}

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(tar\.gz|zip)$/;
const KIND_RE = /^hall-booking-(manual|scheduled|before-reset|before-restore|uploaded|pre-update)-/;

export function isSnapshotSupported(): boolean {
  return typeof rawSql.snapshot === "function";
}

export function defaultBackupDir(): string {
  return path.resolve(resolveDataDir(), "..", "backups");
}

/** Older builds kept automatic pre-reset snapshots inside the data folder. */
function legacyDir(): string {
  return path.join(resolveDataDir(), "backups");
}

export function backupDir(o?: PlatformOptions["backup"]): string {
  const custom = o?.directory?.trim();
  return custom ? path.resolve(custom) : defaultBackupDir();
}

/** Throws a user-facing Arabic message when the folder cannot be used. */
export function checkDirectory(dir: string): { path: string; freeBytes: number | null } {
  if (!path.isAbsolute(dir)) throw new Error("اكتب المسار كاملاً، مثل D:\\Backups\\HallBooking");
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
  } catch {
    throw new Error("لا يمكن الكتابة في هذا المجلد — تأكد من وجود القرص وصلاحيات الكتابة");
  }
  let freeBytes: number | null = null;
  try {
    const st = fs.statfsSync(dir);
    freeBytes = Number(st.bavail) * Number(st.bsize);
  } catch {
    /* not available on every platform */
  }
  return { path: path.resolve(dir), freeBytes };
}

function kindOf(name: string, location: "main" | "legacy"): BackupKind {
  if (location === "legacy") return "legacy";
  const m = KIND_RE.exec(name);
  if (!m) return name.endsWith(".zip") ? "legacy" : "uploaded";
  return m[1] === "pre-update" ? "legacy" : (m[1] as BackupKind);
}

function listFolder(dir: string, location: "main" | "legacy"): BackupItem[] {
  if (!fs.existsSync(dir)) return [];
  const out: BackupItem[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!NAME_RE.test(name)) continue;
    const full = path.join(dir, name);
    let st: fs.Stats;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    out.push({ name, kind: kindOf(name, location), size: st.size, createdAt: st.mtime.toISOString(), restorable: name.endsWith(".tar.gz"), location });
  }
  return out;
}

export async function listBackups(): Promise<{ dir: string; items: BackupItem[] }> {
  const o = await getOptions();
  const dir = backupDir(o.backup);
  const items = [...listFolder(dir, "main")];
  const legacy = legacyDir();
  if (path.resolve(legacy) !== path.resolve(dir)) items.push(...listFolder(legacy, "legacy"));
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { dir, items };
}

/** Resolve a listed backup by bare file name (never a path) — guards against traversal. */
export async function resolveBackup(name: string): Promise<{ file: string; item: BackupItem } | null> {
  if (!NAME_RE.test(name)) return null;
  const { items, dir } = await listBackups();
  const item = items.find((i) => i.name === name);
  if (!item) return null;
  return { file: path.join(item.location === "legacy" ? legacyDir() : dir, name), item };
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

let running: Promise<BackupItem> | null = null;

export async function createBackup(kind: Exclude<BackupKind, "legacy" | "uploaded">): Promise<BackupItem> {
  if (!isSnapshotSupported()) throw new Error("النسخ الاحتياطي من داخل المنصة متاح مع قاعدة البيانات المدمجة فقط");
  // One snapshot at a time; a second request waits for the first and then makes its own.
  while (running) await running.catch(() => undefined);
  const job = (async () => {
    const o = await getOptions();
    const dir = checkDirectory(backupDir(o.backup)).path;
    const name = `hall-booking-${kind}-${stamp()}.tar.gz`;
    const file = path.join(dir, name);
    await rawSql.snapshot!(file);
    const st = fs.statSync(file);
    logger.info({ file, size: st.size, kind }, "Backup created");
    return { name, kind, size: st.size, createdAt: st.mtime.toISOString(), restorable: true, location: "main" } as BackupItem;
  })();
  running = job;
  try {
    return await job;
  } finally {
    running = null;
  }
}

export async function deleteBackups(names: string[]): Promise<number> {
  let n = 0;
  for (const name of names) {
    const r = await resolveBackup(name);
    if (!r) continue;
    try {
      fs.unlinkSync(r.file);
      n++;
    } catch (e) {
      logger.warn({ e, name }, "Could not delete backup");
    }
  }
  return n;
}

export async function saveUploadedBackup(original: string, data: Buffer): Promise<BackupItem> {
  if (data.length < 64 || data[0] !== 0x1f || data[1] !== 0x8b) throw new Error("الملف ليس نسخة احتياطية صالحة (يجب أن يكون ‎.tar.gz‎ من المنصة)");
  const o = await getOptions();
  const dir = checkDirectory(backupDir(o.backup)).path;
  const base = original.replace(/\.tar\.gz$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "backup";
  const name = `hall-booking-uploaded-${stamp()}-${base}.tar.gz`.replace(/-+/g, "-");
  fs.writeFileSync(path.join(dir, name), data);
  const st = fs.statSync(path.join(dir, name));
  return { name, kind: "uploaded", size: st.size, createdAt: st.mtime.toISOString(), restorable: true, location: "main" };
}

/** Retention: keep the newest N scheduled backups and drop any backup older than maxAgeDays (0 = off). */
export async function applyRetention(): Promise<number> {
  const o = await getOptions();
  const { items } = await listBackups();
  const mine = items.filter((i) => i.location === "main");
  const doomed = new Set<string>();
  if (o.backup.keepScheduled > 0) {
    mine.filter((i) => i.kind === "scheduled").slice(o.backup.keepScheduled).forEach((i) => doomed.add(i.name));
  }
  if (o.backup.maxAgeDays > 0) {
    const limit = Date.now() - o.backup.maxAgeDays * 86_400_000;
    mine.filter((i) => (i.kind === "scheduled" || i.kind === "before-reset" || i.kind === "before-restore") && Date.parse(i.createdAt) < limit).forEach((i) => doomed.add(i.name));
  }
  return doomed.size ? deleteBackups([...doomed]) : 0;
}

/* ---------------- restore (applied at the next start) ---------------- */

export function pendingRestoreFile(): string {
  return path.join(resolveDataDir(), "restore.pending.json");
}
export function restoreResultFile(): string {
  return path.join(resolveDataDir(), "restore.result.json");
}

export async function scheduleRestore(name: string): Promise<{ safety: BackupItem }> {
  const r = await resolveBackup(name);
  if (!r) throw new Error("النسخة غير موجودة");
  if (!r.item.restorable) throw new Error("هذه النسخة بصيغة ZIP — استعدها من «control app.bat» الخيار [18]");
  const safety = await createBackup("before-restore");
  fs.writeFileSync(pendingRestoreFile(), JSON.stringify({ file: r.file, name, requestedAt: new Date().toISOString(), safety: safety.name }));
  return { safety };
}

export function lastRestoreResult(): unknown {
  try {
    return JSON.parse(fs.readFileSync(restoreResultFile(), "utf8"));
  } catch {
    return null;
  }
}

/* ---------------- schedule ---------------- */

interface ScheduleState {
  key?: string;
  since?: string;
  lastRunAt?: string;
  lastResult?: { ok: boolean; at: string; name?: string; error?: string };
}

function stateFile(): string {
  return path.join(resolveDataDir(), "backup-state.json");
}
export function readState(): ScheduleState {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), "utf8"));
  } catch {
    return {};
  }
}
function writeState(s: ScheduleState) {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(s, null, 2));
  } catch (e) {
    logger.warn({ e }, "Could not write backup state");
  }
}

function slotMatches(b: PlatformOptions["backup"], d: Date): boolean {
  if (b.frequency === "weekly") return b.weekdays.includes(d.getDay());
  if (b.frequency === "monthly") {
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(b.monthDay, last);
  }
  return true;
}

/** All slot times between `from` and `to` (inclusive), oldest first. */
function slotsBetween(b: PlatformOptions["backup"], from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let guard = 0; day <= to && guard < 400; guard++, day.setDate(day.getDate() + 1)) {
    if (!slotMatches(b, day)) continue;
    for (const t of [...b.times].sort()) {
      const [h, m] = t.split(":").map(Number);
      const slot = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      if (slot >= from && slot <= to) out.push(slot);
    }
  }
  return out;
}

export function nextRun(b: PlatformOptions["backup"], now = new Date()): string | null {
  if (!b.scheduleEnabled || !b.times.length) return null;
  const to = new Date(now.getTime() + 400 * 86_400_000);
  const next = slotsBetween(b, new Date(now.getTime() + 1000), to)[0];
  return next ? next.toISOString() : null;
}

function scheduleKey(b: PlatformOptions["backup"]): string {
  return JSON.stringify([b.scheduleEnabled, b.frequency, [...b.times].sort(), [...b.weekdays].sort(), b.monthDay]);
}

/** Called right after the settings are saved, so a slot a few seconds later is not missed. */
export function syncScheduleState(b: PlatformOptions["backup"], now = new Date()): void {
  const state = readState();
  const key = scheduleKey(b);
  if (state.key !== key) writeState({ ...state, key, since: new Date(now.getTime() - 1000).toISOString() });
}

let ticking = false;
export async function tickSchedule(now = new Date()): Promise<void> {
  if (ticking || !isSnapshotSupported()) return;
  ticking = true;
  try {
    const o = await getOptions();
    const b = o.backup;
    const state = readState();
    const key = scheduleKey(b);
    if (state.key !== key) {
      // Schedule changed: start counting from now, never "catch up" on slots before the change.
      writeState({ ...state, key, since: now.toISOString() });
      return;
    }
    if (!b.scheduleEnabled || !b.times.length) return;
    const from = new Date(Math.max(Date.parse(state.since ?? now.toISOString()), Date.parse(state.lastRunAt ?? "1970-01-01")) + 1000);
    // Only the most recent missed slot is run (e.g. the computer was off overnight).
    const due = slotsBetween(b, from, now).at(-1);
    if (!due) return;
    try {
      const item = await createBackup("scheduled");
      const removed = await applyRetention();
      writeState({ ...readState(), lastRunAt: now.toISOString(), lastResult: { ok: true, at: now.toISOString(), name: item.name } });
      logger.info({ name: item.name, removed }, "Scheduled backup done");
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      writeState({ ...readState(), lastRunAt: now.toISOString(), lastResult: { ok: false, at: now.toISOString(), error } });
      logger.error({ error }, "Scheduled backup failed");
    }
  } finally {
    ticking = false;
  }
}

export function startBackupScheduler(): void {
  const run = () => void tickSchedule().catch((e) => logger.error({ e }, "Backup scheduler error"));
  setTimeout(run, 15_000);
  setInterval(run, 60_000).unref();
}
