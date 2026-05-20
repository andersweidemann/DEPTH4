"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { V2Plan } from "@/lib/thesis-engine-v2/plan";
import { v2PlanFromUserTier } from "@/lib/thesis-engine-v2/plan";

/** @deprecated Session override removed — plan comes from the signed-in account. */
const V2_PLAN_KEY = "depth4.v2.plan.v1";

/** Clear legacy demo tier from sessionStorage (pre-billing wiring). */
export function clearLegacyV2PlanOverride() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(V2_PLAN_KEY);
  } catch {
    // ignore
  }
}

export function useV2Plan() {
  const { user } = useAuth();

  const plan = useMemo<V2Plan>(() => {
    if (user?.tier) return v2PlanFromUserTier(user.tier);
    return "free";
  }, [user?.tier]);

  /** No-op: tier changes via Stripe webhook → `public.users.tier`, not client storage. */
  function setPlan(next: V2Plan) {
    void next;
    clearLegacyV2PlanOverride();
  }

  return { plan, setPlan };
}
