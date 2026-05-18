"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CollapsibleThesisSection } from "@/components/thesis-engine-v2/CollapsibleThesisSection";
import { eventCategoryLabel } from "@/lib/causal-map/category-labels";
import { filterAffect, PRICED_IN_HIDE_THRESHOLD } from "@/lib/causal-map/causal-map-filters";
import { useCausalChain } from "@/hooks/use-causal-chain";
import { formatTimeAgo } from "@/lib/thesis-helpers";
import { cn } from "@/lib/utils";
import type { CausalAffectWithAsset, CausalChainResponse } from "@/types/causal-graph";

export function CausalChainGraph({ thesisSlug }: { thesisSlug: string }) {
  const { data, error, isLoading } = useCausalChain(thesisSlug);
  const [hidePricedIn, setHidePricedIn] = useState(false);

  if (isLoading) {
    return (
      <div className="mt-6" data-testid="causal-chain-loading">
        <CausalChainSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <CollapsibleThesisSection
        title="Causal chain"
        subtitle="Could not load causal graph data."
        defaultOpen={false}
        contentClassName="pb-4"
      >
        <p className="text-[12px] text-red-400/90">
          {error instanceof Error ? error.message : "Failed to load causal chain."}
        </p>
      </CollapsibleThesisSection>
    );
  }

  if (!data) {
    return (
      <div className="mt-6 rounded-lg border border-white/[0.06] bg-zinc-900/20 px-4 py-5">
        <p className="text-[11px] text-zinc-500">No causal data for this thesis.</p>
      </div>
    );
  }

  return (
    <CausalChainContent chain={data} hidePricedIn={hidePricedIn} onHidePricedInChange={setHidePricedIn} />
  );
}

function CausalChainContent({
  chain,
  hidePricedIn,
  onHidePricedInChange,
}: {
  chain: CausalChainResponse;
  hidePricedIn: boolean;
  onHidePricedInChange: (v: boolean) => void;
}) {
  const { thesis, rootEvent, targetAsset, affects, relatedTheses } = chain;

  const visibleAffects = useMemo(() => {
    const filtered = affects.filter((a) => filterAffect(a, hidePricedIn));
    const targetSym = targetAsset.symbol.toUpperCase();
    return [...filtered].sort((a, b) => {
      const aTarget = a.asset.symbol.toUpperCase() === targetSym ? 1 : 0;
      const bTarget = b.asset.symbol.toUpperCase() === targetSym ? 1 : 0;
      if (aTarget !== bTarget) return bTarget - aTarget;
      return b.strength - a.strength;
    });
  }, [affects, hidePricedIn, targetAsset.symbol]);

  const directionLabel = thesis.direction === "up" ? "LONG" : "SHORT";
  const arrow = thesis.direction === "up" ? "↑" : "↓";

  return (
    <section
      className="mt-6 rounded-lg border border-white/[0.08] bg-zinc-900/30 p-4"
      aria-label="Causal chain"
      data-testid="causal-chain-graph"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Causal chain</p>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
          <input
            type="checkbox"
            checked={hidePricedIn}
            onChange={(e) => onHidePricedInChange(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-white/[0.08] accent-amber-500"
          />
          Hide assets &gt;{PRICED_IN_HIDE_THRESHOLD}% priced in
        </label>
      </div>

      <div className="mx-auto mt-4 flex max-w-lg flex-col items-stretch">
        <RootEventNode event={rootEvent} />
        <VerticalConnector />
        <ThisThesisNode thesis={thesis} directionLabel={directionLabel} arrow={arrow} />
        {visibleAffects.length > 0 ? (
          <>
            <VerticalConnector />
            <ul className="space-y-2 pl-4">
              {visibleAffects.map((affect) => (
                <AffectTreeNode
                  key={affect.asset.id}
                  affect={affect}
                  isTarget={affect.asset.symbol.toUpperCase() === targetAsset.symbol.toUpperCase()}
                />
              ))}
            </ul>
          </>
        ) : hidePricedIn ? (
          <p className="mt-3 pl-4 text-[11px] text-zinc-600">All affects hidden by priced-in filter.</p>
        ) : null}
      </div>

      {relatedTheses.length > 0 ? (
        <div className="mt-6 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">From the same event</p>
          <div className="mt-2 space-y-2">
            {relatedTheses.map((t) => (
              <Link
                key={t.slug}
                href={`/theses/${t.slug}`}
                className="flex items-center gap-2 text-[12px] text-zinc-300 hover:text-amber-400"
              >
                <span className={t.direction === "up" ? "text-emerald-400" : "text-red-400"}>
                  {t.direction === "up" ? "↑" : "↓"}
                </span>
                <span className="font-medium">{t.targetAssetSymbol}</span>
                <span className="truncate text-zinc-500">{t.statement}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RootEventNode({ event }: { event: CausalChainResponse["rootEvent"] }) {
  return (
    <div className="w-full rounded-lg border-2 border-amber-500/50 bg-zinc-900/40 px-4 py-3">
      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-400">
        Event
      </span>
      <p className="mt-2 text-[13px] font-semibold text-zinc-100">{event.title}</p>
      {event.description ? (
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{event.description}</p>
      ) : null}
      <p className="mt-2 text-[11px] tabular-nums text-zinc-500">
        Confidence {event.confidence}% · {eventCategoryLabel(event.category)} · detected{" "}
        {formatTimeAgo(event.firstDetected)}
      </p>
    </div>
  );
}

function ThisThesisNode({
  thesis,
  directionLabel,
  arrow,
}: {
  thesis: CausalChainResponse["thesis"];
  directionLabel: string;
  arrow: string;
}) {
  return (
    <div className="w-full rounded-lg border-2 border-amber-500/50 bg-amber-500/[0.04] px-4 py-3">
      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
        This thesis
      </span>
      <p className="mt-2 text-[13px] font-bold text-zinc-100">
        {thesis.targetAssetSymbol} {directionLabel} — {arrow} {thesis.title}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{thesis.statement}</p>
      <p className="mt-2 text-[11px] tabular-nums text-zinc-500">
        Conviction {thesis.conviction}% · Mispricing {thesis.mispricingScore}/100
      </p>
    </div>
  );
}

function AffectTreeNode({
  affect,
  isTarget,
}: {
  affect: CausalAffectWithAsset;
  isTarget: boolean;
}) {
  const edge = affect.mispricingScore >= 70 && affect.pricedInPercent <= 40;
  const strengthStyle = affectStrengthStyle(affect.strength);
  const dirArrow = affect.direction === "up" ? "↑" : affect.direction === "down" ? "↓" : "→";
  const dirColor =
    affect.direction === "up"
      ? "text-emerald-400"
      : affect.direction === "down"
        ? "text-red-400"
        : "text-zinc-500";
  const roleLabel = isTarget
    ? "target"
    : affect.strength < 30
      ? "speculative"
      : affect.strength < 70
        ? "indirect"
        : "direct";

  return (
    <li className="relative flex items-start gap-2">
      <span className="mt-2 text-[11px] text-amber-500/60" aria-hidden>
        ├─→
      </span>
      <div
        className={cn(
          "min-w-0 flex-1 rounded-md border px-3 py-2",
          strengthStyle.border,
          strengthStyle.bg,
          edge && "ring-1 ring-[#E8473F]/25",
          affect.strength < 30 && "opacity-75",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-[12px] font-bold tabular-nums", dirColor)}>{dirArrow}</span>
          <span className="text-[12px] font-semibold text-zinc-200">{affect.asset.symbol}</span>
          {affect.asset.name !== affect.asset.symbol ? (
            <span className="text-[10px] text-zinc-600">{affect.asset.name}</span>
          ) : null}
          {edge ? (
            <span className="rounded bg-[#E8473F]/15 px-1 py-0.5 text-[9px] font-semibold uppercase text-[#E8473F]">
              Edge
            </span>
          ) : null}
        </div>
        <p className={cn("mt-0.5 text-[11px] tabular-nums", affect.strength < 30 ? "text-zinc-600" : "text-zinc-500")}>
          {roleLabel} — {affect.strength}% strength, {affect.pricedInPercent}% priced in
        </p>
        {affect.whyItMatters ? (
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">{affect.whyItMatters}</p>
        ) : null}
      </div>
    </li>
  );
}

function affectStrengthStyle(strength: number): { border: string; bg: string } {
  if (strength > 70) {
    return { border: "border-white/[0.12]", bg: "bg-zinc-900/40" };
  }
  if (strength >= 30) {
    return { border: "border-dashed border-white/[0.10]", bg: "bg-zinc-900/25" };
  }
  return { border: "border-dotted border-white/[0.08]", bg: "bg-zinc-900/15" };
}

function VerticalConnector() {
  return (
    <div className="flex justify-center py-1" aria-hidden>
      <div className="h-6 w-px bg-amber-500/40" />
    </div>
  );
}

function CausalChainSkeleton() {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-zinc-900/20 p-4">
      <div className="h-3 w-24 animate-pulse rounded bg-zinc-800" />
      <div className="mt-4 space-y-3">
        <div className="h-20 w-full animate-pulse rounded-lg bg-zinc-800/80" />
        <div className="mx-auto h-6 w-px animate-pulse bg-zinc-800" />
        <div className="h-16 w-full animate-pulse rounded-lg bg-zinc-800/80" />
        <div className="mx-auto h-6 w-px animate-pulse bg-zinc-800" />
        <div className="h-10 w-full animate-pulse rounded-md bg-zinc-800/60" />
        <div className="h-10 w-full animate-pulse rounded-md bg-zinc-800/60" />
      </div>
    </div>
  );
}
