/**
 * Loaded first (before any module reads process.env).
 * Reads KEY=VALUE pairs from ENV_FILE (default: ./config.env, then ./.env). Real environment variables win.
 */
import fs from "node:fs";
import path from "node:path";

const candidates = [process.env.ENV_FILE, path.resolve(process.cwd(), "config.env"), path.resolve(process.cwd(), ".env")].filter(Boolean) as string[];
for (const file of candidates) {
  if (!fs.existsSync(file)) continue;
  for (const raw of fs.readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
  break;
}
process.env.TZ = process.env.TZ || "Asia/Baghdad";
process.env.NODE_ENV = process.env.NODE_ENV || "production";
