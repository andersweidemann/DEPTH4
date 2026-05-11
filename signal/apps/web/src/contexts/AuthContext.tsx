"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { LoginCredentials, User } from "@/types/auth";
import { createClient } from "@/lib/supabase/client";

export const AuthContext = createContext<{
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (creds: LoginCredentials) => Promise<void>;
  signup: (creds: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
} | null>(null);

type LoginResponse = {
  user: User;
  token: string;
  refresh_token?: string;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      let token = localStorage.getItem("depth4_token") || sessionStorage.getItem("depth4_token");

      if (!token) {
        const supa = createClient();
        const {
          data: { session },
        } = await supa.auth.getSession();
        if (session?.access_token) {
          token = session.access_token;
          try {
            localStorage.setItem("depth4_token", token);
          } catch {
            sessionStorage.setItem("depth4_token", token);
          }
        }
      }

      if (!token) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      try {
        const r = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (r.ok) {
          const data = (await r.json()) as { user?: User | null };
          if (!cancelled) setUser(data.user ?? null);
        } else {
          localStorage.removeItem("depth4_token");
          sessionStorage.removeItem("depth4_token");
        }
      } catch {
        localStorage.removeItem("depth4_token");
        sessionStorage.removeItem("depth4_token");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistToken = useCallback((rememberMe: boolean, token: string) => {
    if (rememberMe) {
      sessionStorage.removeItem("depth4_token");
      localStorage.setItem("depth4_token", token);
    } else {
      localStorage.removeItem("depth4_token");
      sessionStorage.setItem("depth4_token", token);
    }
  }, []);

  const syncSupabaseSession = useCallback(async (token: string, refreshToken?: string) => {
    const supa = createClient();
    if (refreshToken) {
      await supa.auth.setSession({ access_token: token, refresh_token: refreshToken });
    }
  }, []);

  const login = useCallback(
    async (creds: LoginCredentials) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message || "Login failed");
      }
      const data = (await res.json()) as LoginResponse;
      persistToken(creds.rememberMe, data.token);
      await syncSupabaseSession(data.token, data.refresh_token);
      setUser(data.user);
    },
    [persistToken, syncSupabaseSession],
  );

  const signup = useCallback(
    async (creds: { email: string; password: string }) => {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message || "Signup failed");
      }
      const data = (await res.json()) as LoginResponse;
      localStorage.removeItem("depth4_token");
      sessionStorage.removeItem("depth4_token");
      localStorage.setItem("depth4_token", data.token);
      await syncSupabaseSession(data.token, data.refresh_token);
      setUser(data.user);
    },
    [syncSupabaseSession],
  );

  const logout = useCallback(async () => {
    const token = localStorage.getItem("depth4_token") || sessionStorage.getItem("depth4_token");
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // still clear client state
    }
    try {
      const supa = createClient();
      await supa.auth.signOut();
    } catch {
      // ignore
    }
    localStorage.removeItem("depth4_token");
    sessionStorage.removeItem("depth4_token");
    setUser(null);
    window.location.href = "/";
  }, []);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem("depth4_token") || sessionStorage.getItem("depth4_token");
    if (!token) return;
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    if (res.ok) {
      const data = (await res.json()) as { user?: User | null };
      setUser(data.user ?? null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      signup,
      logout,
      refreshUser,
    }),
    [user, isLoading, login, signup, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
