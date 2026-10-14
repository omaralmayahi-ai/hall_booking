import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { User } from "@workspace/api-client-react";

export type SessionUser = User & { mustChangePassword?: boolean };

interface AuthContextType {
  user: SessionUser | null;
  token: string | null;
  login: (user: SessionUser, token: string) => void;
  logout: () => void;
  updateUser: (patch: Partial<SessionUser>) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readUser(): SessionUser | null {
  try {
    const saved = localStorage.getItem("user");
    return saved ? (JSON.parse(saved) as SessionUser) : null;
  } catch {
    return null;
  }
}

/** Fired by the API layer when the server answers 401 (expired / revoked session). */
export const AUTH_EXPIRED_EVENT = "auth:expired";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"));
  const [user, setUser] = useState<SessionUser | null>(() => (localStorage.getItem("token") ? readUser() : null));

  const login = useCallback((newUser: SessionUser, newToken: string) => {
    localStorage.setItem("user", JSON.stringify(newUser));
    localStorage.setItem("token", newToken);
    setUser(newUser);
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    setUser(null);
    setToken(null);
  }, []);

  const updateUser = useCallback((patch: Partial<SessionUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      localStorage.setItem("user", JSON.stringify(next));
      return next;
    });
  }, []);

  // Re-validate the stored session with the server on start-up.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 401) return logout();
        if (r.ok) {
          const me = (await r.json()) as SessionUser;
          localStorage.setItem("user", JSON.stringify(me));
          setUser(me);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onExpired = () => logout();
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    // Keep several open tabs in sync
    const onStorage = (e: StorageEvent) => {
      if (e.key === "token" && !e.newValue) {
        setUser(null);
        setToken(null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
      window.removeEventListener("storage", onStorage);
    };
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateUser, isAuthenticated: !!user && !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export const ROLE_LABELS: Record<string, string> = {
  admin: "مدير النظام",
  relations_manager: "مدير العلاقات",
  requesting_department: "جهة طالبة",
};

export function homePathFor(role?: string | null): string {
  if (role === "admin") return "/admin/dashboard";
  if (role === "relations_manager") return "/manager/dashboard";
  if (role === "requesting_department") return "/department/dashboard";
  return "/login";
}
