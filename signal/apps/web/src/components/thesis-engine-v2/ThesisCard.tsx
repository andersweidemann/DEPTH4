"use client";

import Link from "next/link";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { cn } from "@/lib/utils";
import { useThesisLive } from "@/lib/thesis-engine-v2/thesis-live-context";
import { DirectionBadge } from "./DirectionBadge";
import { ProbabilityBar } from "./ProbabilityBar";
import { StatusBadge } from "./StatusBadge";
import { ThesisStarButton } from "./ThesisStarButton";

export function ThesisCard({
  thesis,
  selectedSlug,
  onSelect,
  pulseKey = 0,
}: {
  thesis: Thesis;
  selectedSlug?: string | null;
  onSelect?: (slug: string) => void;
  /** Increment to trigger a brief “live update” pulse on the card. */
  pulseKey?: number;
}) {
  const live = useThesisLive();
  const tradeable = thesis.qualification === "tradeable";
  const isUser = thesis.origin === "user";
  const entrySetupValid = thesis.status === "ready" && thesis.probability >= 55;
  const selected = selectedSlug != null && selectedSlug === thesis.slug;
  const starred = live.isEffectivelyStarred(thesis.id);
  const starDisabled = !!live.starDisabledReason(thesis.id);

  const terminal = thesis.status === "resolved" || thesis.status === "invalidated";
  const className = cn(
    "group relative block w-full rounded-lg border bg-zinc-900/40 p-5 text-left transition-colors hover:bg-zinc-900/70",
    !terminal &&
      (entrySetupValid ? "border-amber-500/25 hover:border-amber-500/35" : "border-white/[0.06] hover:border-amber-500/20"),
    terminal && thesis.status === "resolved" && "border-emerald-500/20 bg-zinc-900/50 hover:border-emerald-500/30",
    terminal && thesis.status === "invalidated" && "border-red-500/25 bg-zinc-900/50 hover:border-red-500/35",
    selected && "ring-1 ring-amber-500/40 border-amber-500/30 bg-zinc-900/65",
    pulseKey > 0 && "animate-[thesis-pulse_0.85s_ease-out_1]",
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
      <div className="flex flex-wrap items-start justify-between gap-3 pr-10">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold leading-snug tracking-tight text-zinc-100 group-hover:text-amber-100/95">
            {thesis.title}
          </h2>
          <p className="mt-2 font-mono text-[11px] text-zinc-500">{thesis.asset}</p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <DirectionBadge direction={thesis.direction} />
          <StatusBadge status={thesis.status} />
          {entrySetupValid && (
            <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200 ring-1 ring-amber-500/25 bg-amber-500/10">
              Entry setup valid
            </span>
          )}
          {tradeable && (
            <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300 ring-1 ring-amber-500/25 bg-amber-500/10">
              Tradeable
            </span>
          )}
          {isUser && (
            <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300 ring-1 ring-white/[0.08] bg-zinc-900/40">
              User thesis
            </span>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="text-[14px] font-semibold tabular-nums text-amber-200/90">{thesis.probability}%</span>
        <div className="min-w-0 flex-1">
          <ProbabilityBar value={thesis.probability} />
        </div>
        <span className="text-[10px] tabular-nums text-zinc-500">score {thesis.scores.total}</span>
      </div>
      <div className="mt-4 space-y-2 border-t border-white/[0.04] pt-4 text-[11px] leading-relaxed text-zinc-500">
        <p>
          <span className="text-zinc-400">Why now · </span>
          {thesis.whyNow}
        </p>
        <p>
          <span className="text-zinc-400">What&apos;s unpriced · </span>
          {thesis.whatsUnpriced}
        </p>
        <p className="font-mono text-[10px] text-zinc-400">{thesis.trade}</p>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[10px] text-zinc-600">
          <span className="text-zinc-500">{thesis.horizon}</span>
          <span className="tabular-nums text-zinc-500">{thesis.lastUpdated}</span>
        </div>
      </div>
    </>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        data-testid={`thesis-card-${thesis.slug}`}
        onClick={() => onSelect(thesis.slug)}
        className={className}
      >
        {body}
      </button>
    );
  }

  return (
    <Link href={`/theses/${thesis.slug}`} data-testid={`thesis-card-${thesis.slug}`} className={className}>
      {body}
    </Link>
  );
}
