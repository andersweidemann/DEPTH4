"use client";

import { useSearchParams } from "next/navigation";
import { CausalMapPage } from "@/components/causal-map/CausalMapPage";
import { ArchivedThesesPage } from "@/components/thesis-engine-v2/ArchivedThesesPage";
import { HiddenThesesPage } from "@/components/thesis-engine-v2/HiddenThesesPage";
import { LiveThesesListPage } from "@/components/thesis-engine-v2/LiveThesesListPage";

/** Primary /theses hub: card view (default), list via `?list=1`, hidden via `?hidden=1`, archived via `?archived=1`. */
export function ThesesRoutePage() {
  const searchParams = useSearchParams();
  const listView = searchParams.get("list") === "1";
  const hiddenView = searchParams.get("hidden") === "1";
  const archivedView = searchParams.get("archived") === "1";

  if (archivedView) {
    return <ArchivedThesesPage />;
  }

  if (hiddenView) {
    return <HiddenThesesPage />;
  }

  if (listView) {
    return <LiveThesesListPage />;
  }

  return <CausalMapPage />;
}
