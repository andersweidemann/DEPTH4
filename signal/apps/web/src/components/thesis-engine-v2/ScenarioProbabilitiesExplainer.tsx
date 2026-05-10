"use client";

/**
 * "Why these probabilities" popover
 *
 * Clean, institutional explanation for how DEPTH4 sets odds:
 *
 *   Title:
 *     "How these probabilities are set"
 *
 *   Body:
 *     "DEPTH4 ingests live macro, news, and market flow, then
 *      updates these odds as the evidence shifts. These are
 *      DEPTH4’s estimates, not investment advice."
 *
 * Shown whenever Scenario View displays authoritative percentages
 * (non-template triple), including **provisional** evidence-model outputs
 * behind `liveScenarioProbabilitiesForThesesEnabled()` / `NEXT_PUBLIC_DEPTH4_LIVE_SCENARIO_PROBS`
 * and **insider** overrides.
 * Copy stays accurate: DEPTH4 ingests macro, news, and flow and revises
 * estimates as evidence shifts — not investment advice.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function ScenarioProbabilitiesExplainer() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <div ref={rootRef} className="relative shrink-0" data-testid="scenario-why-probabilities">
      <button
        type="button"
        className={cn(
          "rounded-none border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors",
          open
            ? "border-[#E8473F]/40 bg-[#E8473F]/[0.08] text-[#E8473F]"
            : "border-white/[0.08] bg-[#111110] text-zinc-400 hover:border-white/[0.12] hover:text-zinc-200",
        )}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        Why these probabilities
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="How these probabilities are set"
          className={cn(
            "absolute right-0 top-[calc(100%+6px)] z-[80] w-[min(20rem,calc(100vw-2rem))]",
            "border border-white/[0.08] bg-[#111110] p-3 shadow-lg ring-1 ring-white/[0.04]",
          )}
        >
          <p className="text-[11px] font-semibold text-zinc-100">How these probabilities are set</p>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
            DEPTH4 ingests live macro, news, and market flow, then updates these odds as the evidence shifts. These are
            DEPTH4&apos;s estimates, not investment advice.
          </p>
        </div>
      ) : null}
    </div>
  );
}
