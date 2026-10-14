import type { Request, Response, NextFunction } from "express";
import type { usersTable } from "@workspace/db";
import { getSessionUser, getTokenFromRequest } from "../lib/auth";

export type SessionUser = typeof usersTable.$inferSelect;

export interface AuthenticatedRequest extends Request {
  user?: SessionUser;
  token?: string;
}

/** Endpoints a user may call while a password change is still required. */
const ALLOWED_WHILE_MUST_CHANGE = new Set(["/auth/me", "/auth/change-password", "/auth/logout"]);

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = await getSessionUser(token);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.mustChangePassword && !ALLOWED_WHILE_MUST_CHANGE.has(req.path)) {
    res.status(403).json({ error: "يجب تغيير كلمة المرور قبل المتابعة", code: "MUST_CHANGE_PASSWORD" });
    return;
  }
  req.user = user;
  req.token = token;
  next();
}

export function requireRole(...roles: SessionUser["role"][]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

/** Strip sensitive columns before sending a user object to the client. */
export function publicUser(u: SessionUser) {
  const { passwordHash: _p, failedLoginCount: _f, lockedUntil: _l, ...rest } = u;
  return {
    ...rest,
    lastLogin: rest.lastLogin ? rest.lastLogin.toISOString() : null,
    passwordChangedAt: rest.passwordChangedAt ? rest.passwordChangedAt.toISOString() : null,
    createdAt: rest.createdAt.toISOString(),
    updatedAt: rest.updatedAt.toISOString(),
  };
}
