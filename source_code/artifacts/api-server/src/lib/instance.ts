import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveDataDir } from "@workspace/db";

/** Single-instance guard: the embedded database must never be opened by two processes at once. */
export function acquireInstanceLock(): () => void {
  const dir = resolveDataDir();
  fs.mkdirSync(dir, { recursive: true });
  const lockFile = path.join(dir, "server.lock");
  if (fs.existsSync(lockFile)) {
    const pid = Number(fs.readFileSync(lockFile, "utf8").trim());
    let alive = false;
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }
    if (alive) {
      throw new Error(`Another server instance is already running (PID ${pid}). Stop it first from "control app.bat".`);
    }
  }
  fs.writeFileSync(lockFile, String(process.pid));
  return () => {
    try {
      if (fs.readFileSync(lockFile, "utf8").trim() === String(process.pid)) fs.unlinkSync(lockFile);
    } catch {
      /* ignore */
    }
  };
}

/** Random token (stored in the data folder) that lets the local control panel request a graceful shutdown. */
export function writeControlToken(): string {
  const token = crypto.randomBytes(24).toString("hex");
  fs.writeFileSync(path.join(resolveDataDir(), "control.token"), token, { mode: 0o600 });
  return token;
}
