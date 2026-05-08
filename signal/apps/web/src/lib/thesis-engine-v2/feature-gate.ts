"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { V2Feature, V2Plan } from "@/lib/thesis-engine-v2/plan";
import { canUse, V2_FEATURE_MIN_PLAN, V2_PLAN_LABEL } from "@/lib/thesis-engine-v2/plan";
import { useV2Plan } from "@/lib/thesis-engine-v2/use-plan";
import { useThesisLiveOptional } from "@/lib/thesis-engine-v2/thesis-live-context";

export const FEATURE_ACCESS: Record<
  | "new-thesis"
  | "open-position"
  | "publish-thesis"
  | "exports"
  | "alerts-advanced"
  | "creator-tools",
  V2Feature
> = {
  "new-thesis": "createPrivateTheses",
  "open-position": "positionTracking",
  "publish-thesis": "publishPublicly",
  exports: "exports",
  "alerts-advanced": "alertsLimited",
  "creator-tools": "publishPublicly",
};

const FEATURE_COPY: Partial<Record<V2Feature, string>> = {
  createPrivateTheses: "create theses",
  positionTracking: "open and track positions",
  publishPublicly: "publish publicly",
  exports: "export",
};

function pricingUrl(source: string, recommended: V2Plan) {
  const sp = new URLSearchParams();
  sp.set("source", source);
  sp.set("recommended", recommended);
  return `/pricing?${sp.toString()}`;
}

export function useRequireFeature() {
  const router = useRouter();
  const { plan } = useV2Plan();
  const live = useThesisLiveOptional();

  return useCallback(
    (feature: V2Feature, source: string, onAllowed: () => void) => {
      const required = V2_FEATURE_MIN_PLAN[feature];
      if (canUse(plan, feature)) {
        onAllowed();
        return;
      }

      const action = FEATURE_COPY[feature] ?? "use this feature";
      const msg = `Upgrade to ${V2_PLAN_LABEL[required]} to ${action}.`;
      live?.pushToast(msg);

      router.push(pricingUrl(source, required));
    },
    [live, plan, router],
  );
}

