"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ThesisLiveProvider } from "@/lib/thesis-engine-v2/thesis-live-context";
import { ThesisLiveToasts } from "@/components/thesis-engine-v2/ThesisLiveToasts";
import { clearLegacyV2PlanOverride } from "@/lib/thesis-engine-v2/use-plan";

function useAccountTierHydration() {
  const { refreshUser, user, isAuthenticated } = useAuth();

  useEffect(() => {
    clearLegacyV2PlanOverride();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void refreshUser();
  }, [isAuthenticated, refreshUser]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") !== "1") return;

    void (async () => {
      try {
        await fetch("/api/billing/sync-tier", { method: "POST", credentials: "include" });
      } catch {
        // still refresh profile from DB
      }
      await refreshUser();
    })();

    params.delete("upgraded");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [refreshUser]);

  useEffect(() => {
    if (!isAuthenticated || user?.tier !== "Free") return;
    if (typeof window === "undefined") return;
    const key = "depth4.tier.sync.attempted";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void (async () => {
      try {
        const res = await fetch("/api/billing/sync-tier", { method: "POST", credentials: "include" });
        if (!res.ok) return;
        const body = (await res.json()) as { synced?: boolean };
        if (body.synced) await refreshUser();
      } catch {
        // ignore
      }
    })();
  }, [isAuthenticated, user?.tier, refreshUser]);
}

export function Depth4V2Shell({ children }: { children: ReactNode }) {
  useAccountTierHydration();

  return (
    <ThesisLiveProvider>
      {children}
      <ThesisLiveToasts />
    </ThesisLiveProvider>
  );
}
