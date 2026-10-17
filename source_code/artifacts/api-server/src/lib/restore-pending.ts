/**
 * Applies a restore scheduled from System Settings → Backups.
 * Runs at start-up BEFORE the database module is loaded (see index.ts), so it must not import @workspace/db.
 */
import fs from "node:fs";
import path from "node:path";

export async function applyPendingRestore(): Promise<void> {
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
  const pgDir = path.resolve(process.env.PGLITE_DATA_DIR || path.join(dataDir, "pglite"));
  const flag = path.join(dataDir, "restore.pending.json");
  const resultFile = path.join(dataDir, "restore.result.json");
  if (!fs.existsSync(flag)) return;
  if ((process.env.DB_DRIVER ?? "pglite").toLowerCase() === "postgres") {
    fs.rmSync(flag, { force: true });
    return;
  }

  let request: { file: string; name: string; safety?: string };
  try {
    request = JSON.parse(fs.readFileSync(flag, "utf8"));
  } finally {
    // Remove first: a broken backup must never put the server into a restart loop.
    fs.rmSync(flag, { force: true });
  }

  const tmp = `${pgDir}.restoring`;
  const old = `${pgDir}.before-restore`;
  const at = new Date().toISOString();
  try {
    if (!fs.existsSync(request.file)) throw new Error("ملف النسخة غير موجود");
    fs.rmSync(tmp, { recursive: true, force: true });
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite(tmp, { loadDataDir: new Blob([fs.readFileSync(request.file)]) });
    await pg.waitReady;
    const r = await pg.query<{ n: number }>("select count(*)::int as n from public.users");
    await pg.close();
    fs.rmSync(old, { recursive: true, force: true });
    if (fs.existsSync(pgDir)) fs.renameSync(pgDir, old);
    fs.renameSync(tmp, pgDir);
    fs.rmSync(old, { recursive: true, force: true }); // the safety snapshot taken before restoring covers it
    fs.writeFileSync(resultFile, JSON.stringify({ ok: true, at, name: request.name, safety: request.safety, users: r.rows[0]?.n ?? 0 }));
    console.log(`[restore] database restored from ${request.name}`);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (!fs.existsSync(pgDir) && fs.existsSync(old)) fs.renameSync(old, pgDir);
    const error = e instanceof Error ? e.message : String(e);
    fs.writeFileSync(resultFile, JSON.stringify({ ok: false, at, name: request.name, error }));
    console.error(`[restore] failed: ${error}`);
  }
}
