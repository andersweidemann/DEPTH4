"use client";

import type { Thesis } from "@/lib/thesis-engine-v2/types";

/** Removed UI banner per design pass. Keep as no-op. */
export function ReadyPing({ theses }: { theses: Thesis[] }) {
  void theses;
  return null;
}
