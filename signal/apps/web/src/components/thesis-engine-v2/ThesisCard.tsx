"use client";

import Link from "next/link";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { cn } from "@/lib/utils";
import { getThesisDisplayTitle } from "@/lib/thesis-engine-v2/thesis-display-title";
import { ThesisHeadingStack } from "@/components/thesis-engine-v2/ThesisHeadingStack";
import { useThesisLive } from "@/lib/thesis-engine-v2/thesis-live-context";
import { DirectionBadge } from "./DirectionBadge";
import { ProbabilityBar } from "./ProbabilityBar";
import { StatusBadge } from "./StatusBadge";
import { ThesisStarButton } from "./ThesisStarButton";
import { Tooltip } from "./Tooltip";
import { MispricingTooltipContent } from "./MispricingTooltipContent";
import { getThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import { canonicalConvictionPercentFromEngineThesis, getThesisDisplayModel } from "@/lib/thesis-engine-v2/thesis-display-selectors";
import { THESIS_CONVICTION_TEMPLATE_NOTE_SHORT } from "@/lib/thesis-engine-v2/thesis-conviction-microcopy";
import { ThesisDisplaySourceDebug } from "@/components/thesis-engine-v2/ThesisDisplaySourceDebug";
import { isRecentlyRemodeled } from "@/lib/thesis-engine-v2/last-remodeled-at";
import { formatTimeAgo } from "@/lib/thesis-helpers";
import { usePublicReadOnlyWorkspace } from "@/hooks/use-public-read-only-workspace";

export function ThesisCard({
  thesis,
  selectedSlug,
  onSelect,
  pulseKey = 0,
  variant = "default",
}: {
  thesis: Thesis;
  selectedSlug?: string | null;
  onSelect?: (slug: string) => void;
  /** Increment to trigger a brief “live update” pulse on the card. */
  pulseKey?: number;
  variant?: "default" | "primary";
}) {
  const live = useThesisLive();
  const publicReadOnly = usePublicReadOnlyWorkspace();
  const tradeable = thesis.qualification === "tradeable";
  const isUser = thesis.origin === "user";
  const pathConviction = canonicalConvictionPercentFromEngineThesis(thesis);
  const entrySetupValid = thesis.status === "ready" && pathConviction >= 50;
  const selected = selectedSlug != null && selectedSlug === thesis.slug;
  const starred = live.isEffectivelyStarred(thesis.id);
  const starDisabled = publicReadOnly || !!live.starDisabledReason(thesis.id);

  const terminal = thesis.status === "resolved" || thesis.status === "invalidated";
  const primary = variant === "primary";
  const mispricing = getThesisMispricing(thesis);
  const displayModel = getThesisDisplayModel(thesis);
  const showRemodelChip = isRecentlyRemodeled(thesis.lastRemodeledAt);
  const className = cn(
    "group relative block w-full rounded-none bg-zinc-900/40 text-left transition-colors hover:bg-zinc-900/55",
    primary ? "p-4 sm:p-5" : "p-3.5 sm:p-4",
    !terminal && entrySetupValid && "bg-gradient-to-br from-amber-500/[0.08] via-zinc-900/40 to-zinc-900/35",
    terminal && thesis.status === "resolved" && "bg-gradient-to-br from-emerald-500/[0.06] via-zinc-900/45 to-zinc-900/35",
    terminal && thesis.status === "invalidated" && "bg-gradient-to-br from-red-500/[0.06] via-zinc-900/45 to-zinc-900/35",
    selected && "bg-zinc-900/60",
    pulseKey > 0 && "animate-[thesis-pulse_0.85s_ease-out_1]",
    showRemodelChip && "ring-1 ring-amber-500/25",
  );

  const body = (
    <>
      <div className="absolute right-3 top-3 z-[1] sm:right-4 sm:top-4">
        <ThesisStarButton
          size="sm"
          dataTestId={`thesis-star-${thesis.slug}`}
          filled={starred}
          disabled={starDisabled}
          title={
            starDisabled
              ? (live.starDisabledReason(thesis.id) ?? undefined)
              : starred
                ? "Starred — alerts on for this thesis"
                : "Star — bookmark and subscribe to alerts"
          }
          onClick={() => live.toggleStar(thesis.id)}
        />
      </div>
      <div
        className={cn(
          "pr-10",
          primary ? "flex flex-wrap items-start justify-between gap-2" : "flex flex-col gap-2",
        )}
      >
        <div className="min-w-0 flex-1">
          <Tooltip label={getThesisDisplayTitle(thesis)} side="top">
            <div className="min-w-0">
              <ThesisHeadingStack
                thesis={thesis}
                titleAs="h2"
                titleClassName={cn(
                  "te2-clamp-2 break-words group-hover:text-amber-100/95",
                  primary ? "text-[14px] sm:text-[15px]" : "text-[13px]",
                )}
              />
            </div>
          </Tooltip>
          <p className={cn("mt-1.5 font-mono text-zinc-500", primary ? "text-[11px]" : "text-[11px]")}>{thesis.asset}</p>
        </div>
        <div className={cn("flex flex-shrink-0 flex-wrap items-center gap-1.5", primary ? "justify-end" : "justify-start")}>
          <DirectionBadge direction={thesis.direction} />
          <StatusBadge status={thesis.status} />
          {entrySetupValid && (
            <span className="inline-flex items-center rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200 ring-1 ring-emerald-500/20">
              Entry setup valid
            </span>
          )}
          {tradeable && (
            <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200/80">
              Tradeable
            </span>
          )}
          {isUser && (
            <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              User thesis
            </span>
          )}
          {showRemodelChip && thesis.lastRemodeledAt ? (
            <span
              className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200/90 ring-1 ring-amber-500/20"
              title={thesis.lastRemodeledAt}
            >
              <span aria-hidden>↻</span>
              Updated {formatTimeAgo(thesis.lastRemodeledAt)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <Tooltip label="Thesis conviction (Clean win + Messy win). Updates as evidence shifts the scenario split.">
          <span className={cn("font-semibold tabular-nums text-amber-200/90", primary ? "text-[16px]" : "text-[14px]")}>
            {pathConviction}%
          </span>
        </Tooltip>
        <div className="min-w-0 flex-1">
          <ProbabilityBar value={pathConviction} />
        </div>
        {Math.abs(mispricing.score - pathConviction) >= 2 ? (
          <div className="flex items-center gap-1 text-[10px] tabular-nums text-zinc-500">
            <span>Mispricing {mispricing.score}/100</span>
            <Tooltip label={<MispricingTooltipContent m={mispricing} />} side="top">
              <span
                aria-label="Mispricing score info"
                className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-sm text-[10px] font-semibold text-zinc-400 ring-1 ring-white/[0.08] hover:text-zinc-200"
              >
                ?
              </span>
            </Tooltip>
          </div>
        ) : null}
      </div>
      <ThesisDisplaySourceDebug convictionPct={displayModel.convictionPct} scenarioSource={displayModel.scenarioSource} />
      {displayModel.convictionIsTemplateEstimate ? (
        <p className="mt-2 text-[10px] leading-snug text-zinc-600" data-testid="thesis-card-template-note">
          {THESIS_CONVICTION_TEMPLATE_NOTE_SHORT}
        </p>
      ) : null}
      <div className="mt-3 space-y-1.5 border-t border-white/[0.04] pt-3 text-[11px] leading-snug text-zinc-500">
        <p>
          <span className="text-zinc-400">Why now · </span>
          {thesis.whyNow}
        </p>
        <p className="font-mono text-[10px] text-zinc-400">{thesis.trade}</p>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[10px] text-zinc-600">
          <span className="text-zinc-500">{thesis.horizon}</span>
          <span className="tabular-nums text-zinc-500">{thesis.lastUpdated}</span>
        </div>
      </div>
    </>
  );

  if (onSelect) {
    return (
      <div
        role="button"
        tabIndex={0}
        data-testid={`thesis-card-${thesis.slug}`}
        onClick={() => onSelect(thesis.slug)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(thesis.slug);
          }
        }}
        className={className}
      >
        {body}
      </div>
    );
  }

  return (
    <Link href={`/theses/${thesis.slug}`} data-testid={`thesis-card-${thesis.slug}`} className={className}>
      {body}
    </Link>
  );
}
