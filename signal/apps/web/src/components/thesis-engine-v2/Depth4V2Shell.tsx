"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ThesisLiveProvider } from "@/lib/thesis-engine-v2/thesis-live-context";
import { ThesisLiveToasts } from "@/components/thesis-engine-v2/ThesisLiveToasts";
import { clearLegacyV2PlanOverride } from "@/lib/thesis-engine-v2/use-plan";

function useAccountTierHydration() {
  const { refreshUser } = useAuth();

  useEffect(() => {
    clearLegacyV2PlanOverride();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") !== "1") return;
    void refreshUser();
    params.delete("upgraded");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [refreshUser]);
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
