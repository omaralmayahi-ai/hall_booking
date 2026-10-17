import express, { Router, type IRouter } from "express";
import fs from "node:fs";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { logAudit, clientIp } from "../lib/auth";
import { getOptions } from "../lib/options";
import {
  applyRetention, backupDir, checkDirectory, createBackup, defaultBackupDir, deleteBackups, isSnapshotSupported,
  lastRestoreResult, listBackups, nextRun, readState, resolveBackup, saveUploadedBackup, scheduleRestore,
} from "../lib/backups";

const router: IRouter = Router();
const admin = [requireAuth, requireRole("admin")] as const;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Everything the Backups tab needs in one call. */
router.get("/settings/backups", ...admin, async (_req, res): Promise<void> => {
  const o = await getOptions();
  const { dir, items } = await listBackups();
  let folder: { ok: boolean; freeBytes: number | null; error?: string };
  try {
    folder = { ok: true, freeBytes: checkDirectory(dir).freeBytes };
  } catch (e) {
    folder = { ok: false, freeBytes: null, error: msg(e) };
  }
  const state = readState();
  res.json({
    supported: isSnapshotSupported(),
    directory: dir,
    defaultDirectory: defaultBackupDir(),
    folder,
    items,
    totalBytes: items.reduce((n, i) => n + i.size, 0),
    lastScheduled: state.lastResult ?? null,
    nextRun: nextRun(o.backup),
    lastRestore: lastRestoreResult(),
  });
});

/** Check a folder before saving it as the backup location. */
router.post("/settings/backups/check-folder", ...admin, async (req, res): Promise<void> => {
  const dir = String(req.body?.directory ?? "").trim();
  try {
    const r = checkDirectory(dir || defaultBackupDir());
    res.json({ ok: true, path: r.path, freeBytes: r.freeBytes });
  } catch (e) {
    res.status(400).json({ error: msg(e) });
  }
});

router.post("/settings/backups", ...admin, async (req: AuthenticatedRequest, res): Promise<void> => {
  const kind = req.body?.kind === "before-reset" ? "before-reset" : "manual";
  try {
    const item = await createBackup(kind);
    await logAudit(req.user!.id, req.user!.username, "backup_create", "backup", undefined, item.name, clientIp(req));
    res.status(201).json(item);
  } catch (e) {
    res.status(400).json({ error: msg(e) });
  }
});

router.post("/settings/backups/upload", ...admin, express.raw({ type: () => true, limit: "1gb" }), async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const name = String(req.query.name ?? "backup.tar.gz");
    const item = await saveUploadedBackup(name, req.body as Buffer);
    await logAudit(req.user!.id, req.user!.username, "backup_upload", "backup", undefined, item.name, clientIp(req));
    res.status(201).json(item);
  } catch (e) {
    res.status(400).json({ error: msg(e) });
  }
});

router.get("/settings/backups/:name/download", ...admin, async (req, res): Promise<void> => {
  const r = await resolveBackup(String(req.params.name));
  if (!r) {
    res.status(404).json({ error: "النسخة غير موجودة" });
    return;
  }
  res.setHeader("Content-Type", r.item.name.endsWith(".zip") ? "application/zip" : "application/gzip");
  res.setHeader("Content-Disposition", `attachment; filename="${r.item.name}"`);
  res.setHeader("Content-Length", String(r.item.size));
  fs.createReadStream(r.file).pipe(res);
});

/** Delete: { names: [...] } or { olderThanDays: N } (optionally limited to kinds). */
router.post("/settings/backups/delete", ...admin, async (req: AuthenticatedRequest, res): Promise<void> => {
  let names: string[] = Array.isArray(req.body?.names) ? req.body.names.filter((n: unknown) => typeof n === "string") : [];
  const days = Number(req.body?.olderThanDays);
  if (!names.length && Number.isFinite(days) && days > 0) {
    const limit = Date.now() - days * 86_400_000;
    names = (await listBackups()).items.filter((i) => Date.parse(i.createdAt) < limit).map((i) => i.name);
  }
  const deleted = await deleteBackups(names.slice(0, 1000));
  await logAudit(req.user!.id, req.user!.username, "backup_delete", "backup", undefined, `${deleted} file(s)`, clientIp(req));
  res.json({ deleted });
});

router.post("/settings/backups/retention", ...admin, async (_req, res): Promise<void> => {
  res.json({ deleted: await applyRetention() });
});

/** Restore: snapshot current data, schedule the swap, restart. */
router.post("/settings/backups/:name/restore", ...admin, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const { safety } = await scheduleRestore(String(req.params.name));
    await logAudit(req.user!.id, req.user!.username, "backup_restore", "backup", undefined, `${req.params.name} (safety: ${safety.name})`, clientIp(req));
    res.json({ restarting: true, safety: safety.name });
    const restart = req.app.locals.requestRestart as ((r: string) => void) | undefined;
    restart?.("restore");
  } catch (e) {
    res.status(400).json({ error: msg(e) });
  }
});

export { backupDir };
export default router;
