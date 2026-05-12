"use client";

import type { ThesisScenarioDisplaySource } from "@/lib/thesis-engine-v2/thesis-display-selectors";

const LABEL: Record<ThesisScenarioDisplaySource, string> = {
  "live-evidence": "live-evidence",
  db: "db",
  "fallback-template": "fallback-template",
};

/**
 * Dev-only: shows canonical conviction % and coarse scenario source (see `inferThesisScenarioDisplaySource`).
 */
export function ThesisDisplaySourceDebug({
  convictionPct,
  scenarioSource,
}: {
  convictionPct: number;
  scenarioSource: ThesisScenarioDisplaySource;
}) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <p
      className="mt-1 font-mono text-[9px] uppercase tracking-wider text-zinc-600"
      data-testid="thesis-display-source-debug"
      aria-hidden
    >
      dev · conviction {Math.round(convictionPct)}% · source: {LABEL[scenarioSource]}
    </p>
  );
}
