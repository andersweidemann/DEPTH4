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
  const tradeable = thesis.qualification === "tradeable";
  const isUser = thesis.origin === "user";
  const entrySetupValid = thesis.status === "ready" && thesis.probability >= 55;
  const selected = selectedSlug != null && selectedSlug === thesis.slug;
  const starred = live.isEffectivelyStarred(thesis.id);
  const starDisabled = !!live.starDisabledReason(thesis.id);

  const terminal = thesis.status === "resolved" || thesis.status === "invalidated";
  const primary = variant === "primary";
  const className = cn(
    "group relative block w-full rounded-none bg-zinc-900/40 text-left transition-colors hover:bg-zinc-900/55",
    primary ? "p-4 sm:p-5" : "p-3.5 sm:p-4",
    !terminal && entrySetupValid && "bg-gradient-to-br from-amber-500/[0.08] via-zinc-900/40 to-zinc-900/35",
    terminal && thesis.status === "resolved" && "bg-gradient-to-br from-emerald-500/[0.06] via-zinc-900/45 to-zinc-900/35",
    terminal && thesis.status === "invalidated" && "bg-gradient-to-br from-red-500/[0.06] via-zinc-900/45 to-zinc-900/35",
    selected && "bg-zinc-900/60",
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
      <div className="flex flex-wrap items-start justify-between gap-2 pr-10">
        <div className="min-w-0 flex-1">
          <h2
            className={cn(
              "font-semibold leading-snug tracking-tight text-zinc-100 group-hover:text-amber-100/95",
              primary ? "text-[14px] sm:text-[15px]" : "text-[13px]",
            )}
          >
            {thesis.title}
          </h2>
          <p className={cn("mt-1.5 font-mono text-zinc-500", primary ? "text-[11px]" : "text-[11px]")}>{thesis.asset}</p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
          <DirectionBadge direction={thesis.direction} />
          <StatusBadge status={thesis.status} />
          {entrySetupValid && (
            <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">
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
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <span className={cn("font-semibold tabular-nums text-amber-200/90", primary ? "text-[16px]" : "text-[14px]")}>
          {thesis.probability}%
        </span>
        <div className="min-w-0 flex-1">
          <ProbabilityBar value={thesis.probability} />
        </div>
        <span className="text-[10px] tabular-nums text-zinc-500">score {thesis.scores.total}</span>
      </div>
      <div className="mt-3 space-y-1.5 border-t border-white/[0.04] pt-3 text-[11px] leading-snug text-zinc-500">
        <p>
          <span className="text-zinc-400">Why now · </span>
          {thesis.whyNow}
        </p>
        <p>
          <span className="text-zinc-400">What&apos;s unpriced · </span>
          {thesis.whatsUnpriced}
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
