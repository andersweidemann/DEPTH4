"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ThesisActionsMenu } from "@/components/thesis-engine-v2/ThesisActionsMenu";
import { ThesisStarButton } from "@/components/thesis-engine-v2/ThesisStarButton";
import { ThesisTree } from "@/components/causal-map/ThesisTree";
import { MatrixToggle } from "@/components/causal-map/MatrixToggle";
import { HoverHelp } from "@/components/ui/HoverHelp";
import { usePublicReadOnlyWorkspace } from "@/hooks/use-public-read-only-workspace";
import { PUBLIC_READ_STAR_TOOLTIP } from "@/lib/theses/public-read-star-copy";
import { useThesisLive } from "@/lib/thesis-engine-v2/thesis-live-context";
import {
  CAUSAL_DIRECTION_TOOLTIPS,
  EDGE_SCORE_TOOLTIP,
  formatQualityScore,
  HORIZON_TOOLTIP,
  QUALITY_SCORE_TOOLTIP,
} from "@/lib/depth-labels";
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
  /** Unclustered thesis — show subtle tag instead of a section header. */
  noCluster?: boolean;
  hasRecentUpdate?: boolean;
  onHide?: () => void;
  onUnhide?: () => void;
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
  noCluster = false,
  hasRecentUpdate = false,
  onHide,
  onUnhide,
}: ThesisMapCardProps) {
  const mispricingScore = thesis.mispricingScore;
  const conflictActive = showConflicts && hasConflict;
  const live = useThesisLive();
  const publicReadOnly = usePublicReadOnlyWorkspace();
  const starred = live.isEffectivelyStarred(thesis.id);
  const starDisabled = publicReadOnly || !!live.starDisabledReason(thesis.id);
  const directionArrow = thesis.direction === "up" ? "↑" : "↓";

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
      <div className="flex w-full items-center gap-1 p-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:bg-white/[0.02]"
          aria-expanded={isExpanded}
        >
          <HoverHelp
            className={cn(
              "w-6 shrink-0 justify-center text-[14px] font-bold",
              thesis.direction === "up" ? "text-emerald-400" : "text-red-400",
            )}
            label={directionArrow}
            tooltip={CAUSAL_DIRECTION_TOOLTIPS[thesis.direction]}
            side="right"
          />

          <span className="w-16 shrink-0 text-[13px] font-semibold text-zinc-200">{thesis.targetAssetSymbol}</span>

          <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[12px] text-zinc-300">
            <span className="truncate">{thesis.title}</span>
            {noCluster ? (
              <span className="shrink-0 text-[10px] text-zinc-600">· No cluster</span>
            ) : null}
          </span>

          <div className="flex shrink-0 items-center gap-2">
            {thesis.qualityScore != null && Number.isFinite(thesis.qualityScore) ? (
              <HoverHelp
                className="text-[10px] tabular-nums text-zinc-500"
                label={formatQualityScore(thesis.qualityScore)}
                tooltip={QUALITY_SCORE_TOOLTIP}
              />
            ) : null}

            <HoverHelp
              className={cn(
                "text-[11px] font-medium tabular-nums",
                mispricingScore >= 60
                  ? "text-amber-400"
                  : mispricingScore >= 30
                    ? "text-zinc-400"
                    : "text-zinc-600",
              )}
              label={`Edge ${mispricingScore}/100`}
              tooltip={EDGE_SCORE_TOOLTIP}
            />
          </div>

          <HoverHelp
            className="hidden w-20 shrink-0 justify-end text-[10px] text-zinc-500 sm:inline-flex"
            label={formatHorizon(thesis.timeHorizon)}
            tooltip={HORIZON_TOOLTIP}
            side="left"
          />

          {hasRecentUpdate ? (
            <span className="relative flex h-2 w-2 shrink-0" title="Updated in the last 24h">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
          ) : null}
        </button>

        <ThesisStarButton
          size="sm"
          dataTestId={`thesis-star-${thesis.slug}`}
          filled={starred}
          disabled={starDisabled}
          title={
            publicReadOnly
              ? PUBLIC_READ_STAR_TOOLTIP
              : starDisabled
                ? (live.starDisabledReason(thesis.id) ?? undefined)
                : starred
                  ? "Starred — alerts on for this thesis"
                  : "Star — bookmark and subscribe to alerts"
          }
          onClick={() => live.toggleStar(thesis.id)}
        />

        {(onHide || onUnhide) && !isExpanded ? (
          <ThesisActionsMenu
            className="shrink-0"
            onHide={onHide}
            onUnhide={onUnhide}
            hideLabel="Hide from view"
          />
        ) : null}

        <button
          type="button"
          onClick={onToggle}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-400"
          aria-label={isExpanded ? "Collapse thesis" : "Expand thesis"}
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")}
            aria-hidden
          />
        </button>
      </div>

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

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link
              href={`/theses/${thesis.slug}`}
              className="text-[11px] font-medium text-[#E8473F] hover:underline"
            >
              Open full thesis →
            </Link>
            {onHide ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onHide();
                }}
                className="text-[10px] text-zinc-500 hover:text-zinc-300"
              >
                Hide from view
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
