"use client";

import Link from "next/link";
import { ThesisOutcomeInlineBadge } from "@/lib/thesis/outcome-badge";
import { useThesisLive } from "@/lib/thesis-engine-v2/thesis-live-context";
import {
  convictionIsTemplateEstimateForThesesListItemWithLive,
  displayConvictionPctFromThesesListItemWithLive,
} from "@/lib/theses/theses-list-live-conviction";
import { formatTimeAgo, getDirectionBadgeClasses, getStatusDotColor, getStatusTextColor } from "@/lib/thesis-helpers";
import { THESIS_CONVICTION_TEMPLATE_NOTE_SHORT } from "@/lib/thesis-engine-v2/thesis-conviction-microcopy";
import { listRowLifecyclePresentation } from "@/lib/theses/thesis-lifecycle";
import { ThesisActionsMenu } from "@/components/thesis-engine-v2/ThesisActionsMenu";
import { ThesisStarButton } from "@/components/thesis-engine-v2/ThesisStarButton";
import { HoverHelp } from "@/components/ui/HoverHelp";
import { usePublicReadOnlyWorkspace } from "@/hooks/use-public-read-only-workspace";
import { EDGE_SCORE_TOOLTIP, SCENARIO_PROBABILITY_TOOLTIP } from "@/lib/depth-labels";
import { useThesisLive } from "@/lib/thesis-engine-v2/thesis-live-context";
import { cn } from "@/lib/utils";
import type { ThesisListItem, ThesisStatus } from "@/types/thesis";

export const TABLE_GRID =
  "grid grid-cols-[minmax(0,1fr)_72px_40px] gap-3 sm:grid-cols-[1fr_80px_80px_80px_40px]";

function ProbColumn({ item, mispricing }: { item: ThesisListItem; mispricing: number }) {
  const { mergeThesis } = useThesisLive();
  const pct = Math.max(
    0,
    Math.min(100, displayConvictionPctFromThesesListItemWithLive(item, mergeThesis)),
  );
  const templateNote = convictionIsTemplateEstimateForThesesListItemWithLive(item, mergeThesis);
  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-2">
        <div className="h-1 w-12 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-amber-500/60" style={{ width: `${pct}%` }} />
        </div>
        <HoverHelp
          className="text-[12px] font-medium text-zinc-300"
          label={
            <>
              {pct}
              <span className="text-zinc-500">%</span>
            </>
          }
          tooltip={SCENARIO_PROBABILITY_TOOLTIP}
        />
      </div>
      <p className="mt-1 hidden text-[10px] text-zinc-600 sm:block">
        <HoverHelp label={`Edge ${mispricing}/100`} tooltip={EDGE_SCORE_TOOLTIP} />
      </p>
      {templateNote ? (
        <p
          className="mt-1 text-[9px] leading-tight text-zinc-600"
          title={THESIS_CONVICTION_TEMPLATE_NOTE_SHORT}
          data-testid="thesis-list-template-note"
        >
          Starter template
        </p>
      ) : null}
    </div>
  );
}

function formatListTime(isoOrText: string): string {
  if (isoOrText && !Number.isNaN(Date.parse(isoOrText))) return formatTimeAgo(isoOrText);
  return isoOrText;
}

function statusLane(s: ThesisStatus): "ready" | "active" | "watch" {
  if (s === "Ready") return "ready";
  if (s === "Active") return "active";
  return "watch";
}

export function ThesisRow({
  item,
  onToggleStar,
  onHide,
}: {
  item: ThesisListItem;
  onToggleStar: () => void;
  onHide?: () => void;
}) {
  const live = useThesisLive();
  const publicReadOnly = usePublicReadOnlyWorkspace();
  const showStarred = live.isEffectivelyStarred(item.thesisId) || item.starred;
  const starDisabled = publicReadOnly || !!live.starDisabledReason(item.thesisId);
  const lane = statusLane(item.status);
  const lifecyclePresentation = item.lifecycle_state
    ? listRowLifecyclePresentation({ status: item.status, lifecycle_state: item.lifecycle_state })
    : null;
  return (
    <div className={cn(TABLE_GRID, "items-start border-b border-white/[0.06] py-4")}>
      <div>
        <p className="text-[10px] text-zinc-500">{item.asset}</p>
        {item.detailResolvable ? (
          <Link
            href={`/theses/${item.slug}`}
            className="mt-0.5 block text-[13px] font-medium text-zinc-100 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
          >
            {item.title}
          </Link>
        ) : (
          <p className="mt-0.5 text-[13px] font-medium text-zinc-300">{item.title}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase",
              getDirectionBadgeClasses(item.direction),
            )}
          >
            {item.direction}
          </span>
          {lane === "watch" ? (
            <span className="rounded-full border border-zinc-600/30 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-400">
              watch
            </span>
          ) : lane === "ready" ? (
            <span className="rounded-full border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-400">
              ready
            </span>
          ) : (
            <span className="rounded-full border border-zinc-600/30 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-400">
              active
            </span>
          )}
        </div>
        {item.whyNow?.trim() ? (
          <p className="mt-1.5 max-w-lg line-clamp-2 text-[11px] leading-relaxed text-zinc-500">{item.whyNow}</p>
        ) : null}
        {item.outcome ? (
          <div className="mt-1.5">
            <ThesisOutcomeInlineBadge outcome={item.outcome} />
          </div>
        ) : item.outcome_label ? (
          <p className="mt-1.5 text-[10px] text-zinc-500">
            Outcome · <span className="text-zinc-300">{item.outcome_label}</span>
          </p>
        ) : null}
      </div>
      <ProbColumn mispricing={item.mispricingScore} item={item} />
      <div className="hidden sm:block">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[10px] uppercase",
            lifecyclePresentation?.textClass ?? getStatusTextColor(item.status),
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              lifecyclePresentation?.dotClass ?? getStatusDotColor(item.status),
            )}
          />
          {lifecyclePresentation?.label ?? item.status}
        </span>
      </div>
      <div className="hidden text-right sm:block">
        <span className="text-[11px] text-zinc-500">{formatListTime(item.lastUpdated)}</span>
      </div>
      <div className="flex items-center justify-end gap-0.5">
        {onHide ? <ThesisActionsMenu onHide={onHide} /> : null}
        <ThesisStarButton
          size="sm"
          dataTestId={`thesis-star-${item.slug}`}
          filled={showStarred}
          disabled={starDisabled}
          title={
            starDisabled
              ? (live.starDisabledReason(item.thesisId) ?? undefined)
              : showStarred
                ? "Starred — alerts on for this thesis"
                : "Star — bookmark and subscribe to alerts"
          }
          onClick={() => onToggleStar()}
        />
      </div>
    </div>
  );
}
