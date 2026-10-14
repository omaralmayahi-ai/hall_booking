import "./env"; // must stay first
import crypto from "node:crypto";
import app from "./app";
import { logger } from "./lib/logger";
import { startMaintenanceReminderJob } from "./lib/maintenanceReminders";
import { startBackgroundJobs } from "./lib/jobs";
import { ensureBranding } from "./lib/branding";
import { bootstrapDatabase } from "./db/bootstrap";
import { acquireInstanceLock, writeControlToken } from "./lib/instance";
import { hashPassword } from "./lib/auth";
import { db, rawSql, usersTable, sessionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const port = Number(process.env.PORT || 5050);
const host = process.env.HOST || "0.0.0.0";

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

/** CLI: emergency reset of the primary admin password (server must be stopped). */
async function resetAdminPassword() {
  await bootstrapDatabase();
  const [admin] = await db.select().from(usersTable).where(and(eq(usersTable.role, "admin"), eq(usersTable.isPrimary, true)));
  if (!admin) throw new Error("Primary admin not found");
  const pwd = `Hb@${crypto.randomBytes(6).toString("base64url")}9`;
  await db.update(usersTable).set({
    passwordHash: hashPassword(pwd), mustChangePassword: true, isActive: true, failedLoginCount: 0, lockedUntil: null, updatedAt: new Date(),
  }).where(eq(usersTable.id, admin.id));
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, admin.id));
  console.log("\n==============================================");
  console.log(` Username           : ${admin.username}`);
  console.log(` Temporary password : ${pwd}`);
  console.log(" (must be changed at the first login)");
  console.log("==============================================\n");
}

async function main() {
  const releaseLock = acquireInstanceLock();
  if (process.argv.includes("--reset-admin-password")) {
    try {
      await resetAdminPassword();
    } finally {
      await rawSql.close();
      releaseLock();
    }
    return;
  }
  if (process.argv.includes("--migrate-only")) {
    await bootstrapDatabase();
    ensureBranding();
    await rawSql.close();
    releaseLock();
    logger.info("Database is up to date");
    return;
  }

  await bootstrapDatabase();
  ensureBranding();
  const controlToken = writeControlToken();

  let shuttingDown = false;
  const shutdown = async (reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, "Shutting down gracefully");
    server.close();
    try {
      await rawSql.close(); // flush the embedded database cleanly
    } catch (e) {
      logger.error({ e }, "Error closing database");
    }
    releaseLock();
    process.exit(0);
  };

  // Local-only endpoint used by "control app.bat" to stop the server cleanly.
  app.post("/internal/shutdown", (req, res) => {
    const ip = req.socket.remoteAddress ?? "";
    const local = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
    const given = String(req.headers["x-control-token"] ?? "");
    const ok = local && given.length === controlToken.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(controlToken));
    if (!ok) {
      res.status(403).end();
      return;
    }
    res.json({ stopping: true });
    setTimeout(() => void shutdown("control panel"), 100);
  });

  const server = app.listen(port, host, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ url: `http://localhost:${port}`, host }, "Hall Booking Platform is running");
    startMaintenanceReminderJob();
    startBackgroundJobs();
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    logger.error(err.code === "EADDRINUSE" ? `Port ${port} is already used by another program` : { err }, "Server error");
    releaseLock();
    process.exit(1);
  });

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGBREAK", () => void shutdown("SIGBREAK"));
}

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

main().catch((err) => {
  logger.error({ err: err?.message ?? err }, "Failed to start");
  process.exit(1);
});
