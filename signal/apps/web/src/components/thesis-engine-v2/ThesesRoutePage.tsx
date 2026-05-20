"use client";

import { useSearchParams } from "next/navigation";
import { CausalMapPage } from "@/components/causal-map/CausalMapPage";
import { HiddenThesesPage } from "@/components/thesis-engine-v2/HiddenThesesPage";
import { LiveThesesListPage } from "@/components/thesis-engine-v2/LiveThesesListPage";

/** Primary /theses hub: card view (default), list via `?list=1`, hidden via `?hidden=1`. */
export function ThesesRoutePage() {
  const searchParams = useSearchParams();
  const listView = searchParams.get("list") === "1";
  const hiddenView = searchParams.get("hidden") === "1";

  if (hiddenView) {
    return <HiddenThesesPage />;
  }

  if (listView) {
    return <LiveThesesListPage />;
  }

  return <CausalMapPage />;
}
