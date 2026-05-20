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
import { cn } from "@/lib/utils";
import type { ThesisListItem, ThesisStatus } from "@/types/thesis";

export const TABLE_GRID =
  "grid grid-cols-[minmax(0,1fr)_72px_40px] gap-3 sm:grid-cols-[1fr_80px_80px_80px_40px]";

function StarOutlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}

function StarSolidIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M10.788 3.21c.448-1.077 1.989-1.076 2.437 0l2.358 5.699 6.141.448c1.036.075 1.459 1.405.664 2.124l-4.707 4.597 1.402 6.116c.227 1.002-.848 1.781-1.726 1.302L12 18.678l-5.357 2.808c-.878.46-1.953-.3-1.726-1.302l1.402-6.116-4.707-4.597c-.795-.719-.372-2.049.664-2.124l6.141-.448 2.358-5.699z" />
    </svg>
  );
}

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
        <span className="text-[12px] font-medium text-zinc-300">
          {pct}
          <span className="text-zinc-500">%</span>
        </span>
      </div>
      <p className="mt-1 hidden text-[10px] text-zinc-600 sm:block">Mispricing {mispricing}/100</p>
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
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
          className="no-print text-zinc-600 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
          aria-label={item.starred ? "Unstar thesis" : "Star thesis"}
        >
          {item.starred ? (
            <StarSolidIcon className="h-4 w-4 fill-amber-400 text-amber-400" />
          ) : (
            <StarOutlineIcon className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
