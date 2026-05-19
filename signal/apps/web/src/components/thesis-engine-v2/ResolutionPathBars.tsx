"use client";

import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { THESIS_DETAIL_TOOLTIPS } from "@/lib/thesis-engine-v2/depth-tooltips";
import { normalizeThesisScenarios } from "@/lib/thesis-engine-v2/thesis-scenarios-normalize";
import type { ThesisScenarioLike } from "@/lib/thesis-engine-v2/thesis-scenarios-normalize";
import { cn } from "@/lib/utils";

function PathBar({
  label,
  probability,
  colorClass,
  description,
  tooltip,
}: {
  label: string;
  probability: number;
  colorClass: string;
  description: string;
  tooltip: string;
}) {
  return (
    <div className="group relative flex items-center gap-2">
      <span className="inline-flex w-20 shrink-0 items-center gap-0.5 text-[10px] text-zinc-500">
        {label}
        <InfoTooltip text={tooltip} maxWidth={200} />
      </span>
      <div className="h-4 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={cn("h-full rounded-full transition-all duration-500", colorClass)}
          style={{ width: `${Math.min(100, Math.max(0, probability))}%`, opacity: 0.75 }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] font-medium tabular-nums text-zinc-300">
        {probability}%
      </span>
      <div className="pointer-events-none absolute bottom-full left-24 z-10 mb-1 hidden max-w-[200px] rounded-md border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[9px] leading-relaxed text-zinc-400 group-hover:block">
        {description}
      </div>
    </div>
  );
}

export function ResolutionPathBars({
  scenarios,
  showPercentages = true,
}: {
  scenarios: ThesisScenarioLike[];
  showPercentages?: boolean;
}) {
  const ordered = normalizeThesisScenarios(scenarios);
  const clean = ordered.find((s) => s.pathKey === "clean_win")!;
  const messy = ordered.find((s) => s.pathKey === "messy_win")!;
  const broken = ordered.find((s) => s.pathKey === "thesis_broken")!;

  if (!showPercentages) {
    return (
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Path odds calibrate from live news — expand Resolution paths below for narratives.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Resolution paths
        </span>
        <InfoTooltip text={THESIS_DETAIL_TOOLTIPS.resolutionPaths} maxWidth={220} />
      </div>

      <div className="space-y-1.5">
        <PathBar
          label="Clean win"
          probability={clean.probability}
          colorClass="bg-emerald-500"
          description={clean.confirmation}
          tooltip={THESIS_DETAIL_TOOLTIPS.resolutionClean}
        />
        <PathBar
          label="Messy win"
          probability={messy.probability}
          colorClass="bg-amber-500"
          description={messy.confirmation}
          tooltip={THESIS_DETAIL_TOOLTIPS.resolutionMessy}
        />
        <PathBar
          label="Broken"
          probability={broken.probability}
          colorClass="bg-red-500"
          description={broken.confirmation}
          tooltip={THESIS_DETAIL_TOOLTIPS.resolutionBroken}
        />
      </div>

      <div className="mt-2 flex h-2 overflow-hidden rounded-full">
        <div
          className="bg-emerald-500 transition-all duration-500"
          style={{ width: `${clean.probability}%` }}
        />
        <div
          className="bg-amber-500 transition-all duration-500"
          style={{ width: `${messy.probability}%` }}
        />
        <div
          className="bg-red-500 transition-all duration-500"
          style={{ width: `${broken.probability}%` }}
        />
      </div>
    </div>
  );
}
