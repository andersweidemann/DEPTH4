"use client";

import { useEffect, useMemo, useState } from "react";
import type { LiveSignalTickerItem } from "@/lib/thesis-engine-v2/types";
import { cn } from "@/lib/utils";

function impactStyle(impact: "major_positive" | "minor_positive" | "neutral" | "minor_negative" | "major_negative") {
  switch (impact) {
    case "major_positive":
      return {
        chip: "text-emerald-300/90",
        label: "Major positive",
      };
    case "minor_positive":
      return {
        chip: "text-emerald-300/70",
        label: "Minor positive",
      };
    case "major_negative":
      return {
        chip: "text-red-300/90",
        label: "Major negative",
      };
    case "minor_negative":
      return {
        chip: "text-red-300/70",
        label: "Minor negative",
      };
    case "neutral":
    default:
      return {
        chip: "text-zinc-300/80",
        label: "Neutral",
      };
  }
}

function kindChip(kind: LiveSignalTickerItem["kind"]) {
  if (kind === "building_new_thesis") {
    return { cls: "text-amber-200/90", text: "Building" };
  }
  if (kind === "catalogued") {
    return { cls: "text-zinc-400", text: "Catalogued" };
  }
  return { cls: "text-zinc-300", text: "Update" };
}

function containerTone(it: LiveSignalTickerItem) {
  if (it.kind === "thesis_update") {
    const impact = impactStyle(it.impact);
    if (impact.label === "Major positive") return "bg-emerald-500/[0.02]";
    if (impact.label === "Major negative") return "bg-red-500/[0.02]";
    if (impact.label === "Minor positive") return "bg-emerald-500/[0.015]";
    if (impact.label === "Minor negative") return "bg-red-500/[0.015]";
    return "bg-zinc-900/20";
  }
  if (it.kind === "building_new_thesis") return "bg-amber-500/[0.015]";
  return "bg-zinc-900/15";
}

export function LiveSignalTicker({
  items,
  intervalMs = 12_000,
}: {
  items: LiveSignalTickerItem[];
  intervalMs?: number;
}) {
  const safe = useMemo(() => (items.length ? items : []), [items]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    if (!safe.length) return;
    const id = window.setInterval(() => {
      setPhase("out");
      window.setTimeout(() => {
        setIdx((cur) => (cur + 1) % safe.length);
        setPhase("in");
      }, 220);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, safe.length]);

  if (!safe.length) return null;
  const it = safe[idx]!;
  const k = kindChip(it.kind);

  return (
    <div className={cn("rounded-none px-3 py-2 ring-1 ring-white/[0.04]", containerTone(it))}>
      <div
        className={cn(
          "transition-all duration-300",
          phase === "in" ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-0.5",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-zinc-500">
          <span className="rounded bg-zinc-950/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300 ring-1 ring-white/[0.06]">
            Live signal
          </span>
          <span className="font-medium text-zinc-400">{it.source}</span>
          <span className="text-zinc-700">·</span>
          <span className="tabular-nums">{it.timestamp}</span>
          <span className="text-zinc-700">·</span>
          <span className={cn("font-semibold uppercase tracking-wide", k.cls)}>{k.text}</span>
          <span className="text-zinc-700">·</span>
          <span className="min-w-0 flex-1 truncate text-zinc-300">“{it.headline}”</span>
        </div>

        {it.kind === "thesis_update" ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            <span className="text-zinc-500">→</span>
            <span className="text-zinc-200">{it.thesisName}</span>
            <span className="tabular-nums text-zinc-400">{it.probabilityBefore}% → {it.probabilityAfter}%</span>
            {(() => {
              const s = impactStyle(it.impact);
              return (
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    s.chip,
                  )}
                >
                  {s.label}
                </span>
              );
            })()}
          </div>
        ) : it.kind === "building_new_thesis" ? (
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            <span className="text-zinc-500">→</span> Building new thesis · <span className="text-amber-200/85">{it.topic}</span>
          </p>
        ) : (
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            <span className="text-zinc-500">→</span> Catalogued · <span className="text-zinc-400">{it.note}</span>
          </p>
        )}
      </div>
    </div>
  );
}

