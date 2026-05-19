"use client";

import { useSearchParams } from "next/navigation";
import { CausalMapPage } from "@/components/causal-map/CausalMapPage";
import { LiveThesesListPage } from "@/components/thesis-engine-v2/LiveThesesListPage";

/** Primary /theses hub: card view (default) or legacy table via `?list=1`. */
export function ThesesRoutePage() {
  const searchParams = useSearchParams();
  const listView = searchParams.get("list") === "1";

  if (listView) {
    return <LiveThesesListPage />;
  }

  return <CausalMapPage />;
}
