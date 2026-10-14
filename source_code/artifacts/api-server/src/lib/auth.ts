import crypto from "node:crypto";
import { db, usersTable, sessionsTable, auditLogsTable, platformSettingsTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";
import type { Request } from "express";

const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS || 12) * 60 * 60 * 1000;
const SESSION_IDLE_MS = Number(process.env.SESSION_IDLE_MINUTES || 120) * 60 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000;

export const MAX_FAILED_LOGINS = Number(process.env.MAX_FAILED_LOGINS || 5);
export const LOCKOUT_MINUTES = Number(process.env.LOCKOUT_MINUTES || 15);

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;
  const attempt = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, "sha512");
  const expected = Buffer.from(hash, "hex");
  return expected.length === attempt.length && crypto.timingSafeEqual(attempt, expected);
}

/** Sessions are stored as SHA-256 hashes so a DB leak does not expose live tokens. */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number, ipAddress?: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessionsTable).values({ userId, token: hashToken(token), ipAddress, expiresAt });
  // Opportunistic clean-up of expired sessions
  await db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, new Date()));
  return token;
}

export async function getSessionUser(token: string) {
  const tokenHash = hashToken(token);
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.token, tokenHash));
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() < now || session.lastActivity.getTime() + SESSION_IDLE_MS < now) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, session.id));
    return null;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
  if (!user || !user.isActive) return null;
  if (now - session.lastActivity.getTime() > ACTIVITY_WRITE_THROTTLE_MS) {
    await db.update(sessionsTable).set({ lastActivity: new Date() }).where(eq(sessionsTable.id, session.id));
  }
  return user;
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.token, hashToken(token)));
}

/** Invalidate every session of a user (password change/reset, deactivation). */
export async function deleteUserSessions(userId: number, exceptToken?: string): Promise<void> {
  if (exceptToken) {
    const keep = hashToken(exceptToken);
    const sessions = await db.select({ id: sessionsTable.id, token: sessionsTable.token }).from(sessionsTable).where(eq(sessionsTable.userId, userId));
    for (const s of sessions) {
      if (s.token !== keep) await db.delete(sessionsTable).where(eq(sessionsTable.id, s.id));
    }
    return;
  }
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
}

export async function logAudit(
  userId: number | null,
  username: string | null,
  action: string,
  entityType: string,
  entityId?: number,
  details?: string,
  ipAddress?: string,
) {
  try {
    await db.insert(auditLogsTable).values({
      userId: userId ?? undefined,
      username: username ?? undefined,
      action,
      entityType,
      entityId,
      details: details?.slice(0, 2000),
      ipAddress,
    });
  } catch {
    // Auditing must never break the main request.
  }
}

export function getTokenFromRequest(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    return /^[a-f0-9]{64}$/i.test(t) ? t : null;
  }
  return null;
}

export function clientIp(req: Request): string | undefined {
  return (req.ip || req.socket?.remoteAddress || undefined)?.replace(/^::ffff:/, "");
}

/** Validate a new password against the platform password policy. Returns an Arabic error or null. */
export async function checkPasswordPolicy(password: string): Promise<string | null> {
  const [s] = await db.select().from(platformSettingsTable).limit(1);
  // Any mix the user prefers (digits only, letters only, symbols…) — only the length is enforced by default.
  const min = Math.max(6, s?.passwordMinLength ?? 6);
  if (typeof password !== "string" || password.length < min) {
    return `كلمة المرور يجب أن تتكون من ${min} رموز على الأقل`;
  }
  if (password.length > 128) return "كلمة المرور طويلة جداً";
  if (s?.passwordRequireSpecial && !/[^A-Za-z0-9]/.test(password)) {
    return "كلمة المرور يجب أن تحتوي على رمز خاص واحد على الأقل";
  }
  return null;
}

export async function registerFailedLogin(userId: number, current: number): Promise<boolean> {
  const next = current + 1;
  const lock = next >= MAX_FAILED_LOGINS;
  await db
    .update(usersTable)
    .set({
      failedLoginCount: lock ? 0 : next,
      lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : undefined,
    })
    .where(eq(usersTable.id, userId));
  return lock;
}


