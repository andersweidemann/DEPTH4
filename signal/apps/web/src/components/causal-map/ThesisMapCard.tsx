"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { ThesisTree } from "@/components/causal-map/ThesisTree";
import { MatrixToggle } from "@/components/causal-map/MatrixToggle";
import { MAP_TOOLTIPS } from "@/lib/thesis-engine-v2/depth-tooltips";
import type { CausalEvent, CausalThesis } from "@/types/causal-graph";
import { cn } from "@/lib/utils";

export interface ThesisMapCardProps {
  thesis: CausalThesis;
  rootEvent: CausalEvent;
  clusterTitle?: string;
  isExpanded: boolean;
  onToggle: () => void;
  hidePricedIn?: boolean;
  hasConflict?: boolean;
  showConflicts?: boolean;
}

function formatHorizon(horizon: string): string {
  const h = horizon.trim();
  if (h.length <= 22) return h;
  return `${h.slice(0, 20)}…`;
}

export function ThesisMapCard({
  thesis,
  rootEvent,
  clusterTitle,
  isExpanded,
  onToggle,
  hidePricedIn = false,
  hasConflict = false,
  showConflicts = false,
}: ThesisMapCardProps) {
  const qualityScore = thesis.qualityScore ?? 0;
  const mispricingScore = thesis.mispricingScore;
  const conflictActive = showConflicts && hasConflict;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border bg-zinc-900/30",
        conflictActive
          ? "border-red-500/30 bg-red-500/[0.04] ring-1 ring-red-500/20"
          : hasConflict
            ? "border-amber-500/40"
            : "border-white/[0.08]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-white/[0.02]"
        aria-expanded={isExpanded}
      >
        <span
          className={cn(
            "flex w-6 items-center justify-center text-[14px] font-bold",
            thesis.direction === "up" ? "text-emerald-400" : "text-red-400",
          )}
          aria-hidden
        >
          {thesis.direction === "up" ? "↑" : "↓"}
          <InfoTooltip
            text={thesis.direction === "up" ? MAP_TOOLTIPS.directionUp : MAP_TOOLTIPS.directionDown}
            maxWidth={160}
          />
        </span>

        <span className="flex w-16 items-center gap-0.5 text-[13px] font-semibold text-zinc-200">
          {thesis.targetAssetSymbol}
          <InfoTooltip text={MAP_TOOLTIPS.assetSymbol} maxWidth={160} />
        </span>

        <span className="flex-1 truncate text-[12px] text-zinc-300">{thesis.title}</span>

        <div className="flex shrink-0 items-center gap-2">
          {thesis.qualityScore != null ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                qualityScore >= 70
                  ? "bg-emerald-500/10 text-emerald-400"
                  : qualityScore >= 45
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-zinc-800 text-zinc-500",
              )}
            >
              Q{qualityScore}
              <InfoTooltip text={MAP_TOOLTIPS.qualityScore} maxWidth={220} />
            </span>
          ) : null}

          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
              mispricingScore >= 60
                ? "text-amber-400"
                : mispricingScore >= 30
                  ? "text-zinc-400"
                  : "text-zinc-600",
            )}
          >
            Edge {mispricingScore}/100
            <InfoTooltip text={MAP_TOOLTIPS.edge} maxWidth={200} />
          </span>
        </div>

        <span className="hidden w-20 shrink-0 text-right text-[10px] text-zinc-500 sm:block">
          {formatHorizon(thesis.timeHorizon)}
        </span>

        <ChevronDown
          className={cn("ml-2 h-4 w-4 shrink-0 text-zinc-600 transition-transform", isExpanded && "rotate-180")}
          aria-hidden
        />
      </button>

      {conflictActive ? (
        <p className="border-t border-red-500/20 px-3 py-1.5 text-[9px] text-red-400">
          ⚠ Conflicts with another thesis in this cluster
        </p>
      ) : null}

      {isExpanded ? (
        <div className="border-t border-white/[0.06] p-3">
          <p className="text-[12px] leading-relaxed text-zinc-400">{thesis.statement}</p>

          <p className="mt-1 text-[10px] text-zinc-600 sm:hidden">{thesis.timeHorizon}</p>

          <ThesisTree
            thesis={thesis}
            rootEvent={rootEvent}
            clusterTitle={clusterTitle}
            hidePricedIn={hidePricedIn}
          />

          <MatrixToggle thesis={thesis} rootEvent={rootEvent} />

          <Link
            href={`/theses/${thesis.slug}`}
            className="mt-3 inline-block text-[11px] font-medium text-[#E8473F] hover:underline"
          >
            Open full thesis →
          </Link>
        </div>
      ) : null}
    </article>
  );
}
