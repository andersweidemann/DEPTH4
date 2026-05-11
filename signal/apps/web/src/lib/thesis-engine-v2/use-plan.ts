"use client";

/**
 * Plan tier here is **sessionStorage + demo default** — intentional until billing maps plan to
 * `public.users` (or similar). Not account-durable across logout; switching device does not inherit it.
 */
import { useEffect, useState } from "react";
import type { V2Plan } from "@/lib/thesis-engine-v2/plan";

const V2_PLAN_KEY = "depth4.v2.plan.v1";

export function loadV2Plan(): V2Plan {
  if (typeof window === "undefined") return "analyst";
  const raw = window.sessionStorage.getItem(V2_PLAN_KEY);
  if (raw === "analyst" || raw === "pro" || raw === "creator" || raw === "free") return raw;
  // Demo default: keep the app fully interactive unless a plan is explicitly set.
  return "analyst";
}

export function saveV2Plan(plan: V2Plan) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(V2_PLAN_KEY, plan);
  } catch {
    // ignore
  }
}

export function useV2Plan() {
  const [plan, setPlan] = useState<V2Plan>("analyst");

  useEffect(() => {
    setPlan(loadV2Plan());
  }, []);

  function update(next: V2Plan) {
    setPlan(next);
    saveV2Plan(next);
  }

  return { plan, setPlan: update };
}

