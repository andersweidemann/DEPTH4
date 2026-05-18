"use client";

/**
 * Helper popover for Scenario View when authoritative percentages are shown.
 * Explains Thesis conviction vs resolution-path (Clean / Messy / Broken) semantics.
 */

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  SCENARIO_PROBABILITIES_POPOVER_DISCLAIMER,
  SCENARIO_PROBABILITIES_POPOVER_TITLE,
} from "@/lib/thesis-engine-v2/thesis-conviction-microcopy";

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
        How to read these
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={SCENARIO_PROBABILITIES_POPOVER_TITLE}
          className={cn(
            "absolute right-0 top-[calc(100%+6px)] z-[80] w-[min(22rem,calc(100vw-2rem))]",
            "border border-white/[0.08] bg-[#111110] p-3 shadow-lg ring-1 ring-white/[0.04]",
          )}
        >
          <p className="text-[11px] font-semibold text-zinc-100">{SCENARIO_PROBABILITIES_POPOVER_TITLE}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
            Thesis conviction is the chance this idea is broadly right. Scenario probabilities show how it is most likely to
            resolve:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-zinc-400 marker:text-zinc-600">
            <li>Clean win: pays roughly as planned</li>
            <li>Messy win: direction right, but the path is slower or choppier</li>
            <li>Thesis broken: the thesis is invalidated and should be retired</li>
          </ul>
          <p className="mt-3 text-[10px] leading-relaxed text-zinc-500">{SCENARIO_PROBABILITIES_POPOVER_DISCLAIMER}</p>
          <Link
            href="/help#thesis-conviction-scenarios"
            className="mt-3 inline-block text-[10px] font-medium text-zinc-500 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-300"
          >
            Full guide →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
