"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ThesisTree } from "@/components/causal-map/ThesisTree";
import { MatrixToggle } from "@/components/causal-map/MatrixToggle";
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
        </span>

        <span className="w-16 text-[13px] font-semibold text-zinc-200">{thesis.targetAssetSymbol}</span>

        <span className="flex-1 truncate text-[12px] text-zinc-300">{thesis.title}</span>

        <div className="flex shrink-0 items-center gap-2">
          {thesis.qualityScore != null ? (
            <span className="text-[10px] tabular-nums text-zinc-500">
              {Math.round(thesis.qualityScore)}/100
            </span>
          ) : null}

          <span
            className={cn(
              "text-[11px] font-medium tabular-nums",
              mispricingScore >= 60
                ? "text-amber-400"
                : mispricingScore >= 30
                  ? "text-zinc-400"
                  : "text-zinc-600",
            )}
          >
            Edge {mispricingScore}/100
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
