"use client";

import Link from "next/link";
import { useState } from "react";
import type { ThesisCluster } from "@/types/causal-graph";
import { eventCategoryLabel } from "@/lib/causal-map/category-labels";
import { filterCluster } from "@/lib/causal-map/causal-map-filters";
import { formatTimeAgo } from "@/lib/thesis-helpers";
import { cn } from "@/lib/utils";
import { AssetAffectChip } from "@/components/causal-map/AssetAffectChip";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-90")}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function ClusterCard({
  cluster,
  hidePricedIn,
  highlightConflicts,
}: {
  cluster: ThesisCluster;
  hidePricedIn: boolean;
  highlightConflicts: boolean;
}) {
  const [impliedOpen, setImpliedOpen] = useState(false);
  const [expandedThesisId, setExpandedThesisId] = useState<string | null>(null);

  const filtered = filterCluster(cluster, hidePricedIn);
  const hasConflicts = cluster.conflictWarnings.length > 0;
  const showConflictStyle = highlightConflicts && hasConflicts;

  return (
    <article
      className={cn(
        "rounded-lg border bg-zinc-900/30 p-4 transition-colors",
        showConflictStyle
          ? "border-red-500/35 ring-1 ring-red-500/20"
          : "border-white/[0.08] hover:border-white/[0.12]",
      )}
      data-testid="cluster-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
          {eventCategoryLabel(cluster.event.category)}
        </span>
        <span className="text-[10px] text-zinc-500">{formatTimeAgo(cluster.event.firstDetected)}</span>
        <span className="text-[10px] tabular-nums text-zinc-600">· {cluster.event.confidence}% event confidence</span>
        {hasConflicts ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              showConflictStyle ? "bg-red-500/20 text-red-300" : "bg-red-500/10 text-red-400",
            )}
          >
            {cluster.conflictWarnings.length} conflict{cluster.conflictWarnings.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>

      <h3 className="mt-2 text-[14px] font-semibold text-zinc-100">{cluster.event.title}</h3>
      <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-400">{cluster.event.description}</p>

      <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
        {filtered.theses.length} thesis{filtered.theses.length === 1 ? "" : "es"} · composite mispricing{" "}
        {cluster.compositeMispricing}/100
      </p>

      {filtered.theses.length === 0 && hidePricedIn ? (
        <p className="mt-3 text-[11px] text-zinc-600">All theses hidden by priced-in filter.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {filtered.theses.map((thesis) => {
            const affectsOpen = expandedThesisId === thesis.id;
            return (
              <ThesisRowBlock
                key={thesis.id}
                thesis={thesis}
                affectsOpen={affectsOpen}
                onToggleAffects={() => setExpandedThesisId(affectsOpen ? null : thesis.id)}
              />
            );
          })}
        </div>
      )}

      {filtered.impliedEffects.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            className="flex items-center gap-1 text-[10px] text-zinc-500 transition-colors hover:text-zinc-300"
            aria-expanded={impliedOpen}
            onClick={() => setImpliedOpen((v) => !v)}
          >
            <ChevronIcon open={impliedOpen} />
            {filtered.impliedEffects.length} implied effect{filtered.impliedEffects.length === 1 ? "" : "s"}
          </button>
          {impliedOpen ? (
            <ul className="mt-2 space-y-2 border-l border-white/[0.06] pl-4">
              {filtered.impliedEffects.map((effect) => (
                <li key={effect.id} className="rounded-md border border-white/[0.05] bg-zinc-900/40 px-3 py-2">
                  <ImpliedEffectRow effect={effect} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {hasConflicts && (!highlightConflicts || showConflictStyle) ? (
        <div
          className={cn(
            "mt-3 rounded-md border p-2.5",
            showConflictStyle ? "border-red-500/30 bg-red-500/10" : "border-red-500/20 bg-red-500/5",
          )}
        >
          {cluster.conflictWarnings.map((w, i) => (
            <p key={i} className="text-[11px] leading-relaxed text-red-400/90">
              {w.conflict}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ThesisRowBlock({
  thesis,
  affectsOpen,
  onToggleAffects,
}: {
  thesis: ThesisCluster["theses"][0];
  affectsOpen: boolean;
  onToggleAffects: () => void;
}) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-zinc-900/50">
      <Link
        href={`/theses/${thesis.slug}`}
        className="flex items-center gap-3 p-2.5 transition-colors hover:bg-white/[0.02]"
      >
        <span
          className={cn("w-4 text-[12px] font-bold", thesis.direction === "up" ? "text-emerald-400" : "text-red-400")}
        >
          {thesis.direction === "up" ? "↑" : "↓"}
        </span>
        <span className="w-14 text-[12px] font-medium text-zinc-200">{thesis.targetAssetSymbol}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-400">{thesis.statement}</span>
        <div className="flex w-20 items-center gap-1.5">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
            <ConvictionBar conviction={thesis.conviction} />
          </div>
          <span className="text-[10px] tabular-nums text-zinc-400">{thesis.conviction}%</span>
        </div>
        <span
          className={cn(
            "w-12 text-right text-[10px] font-medium tabular-nums",
            thesis.mispricingScore >= 70 ? "text-amber-400" : "text-zinc-500",
          )}
        >
          {thesis.mispricingScore}
        </span>
      </Link>
      {thesis.affects.length > 0 ? (
        <div className="border-t border-white/[0.05] px-2.5 pb-2.5 pt-1">
          <button
            type="button"
            className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400"
            aria-expanded={affectsOpen}
            onClick={(e) => {
              e.preventDefault();
              onToggleAffects();
            }}
          >
            <ChevronIcon open={affectsOpen} />
            {thesis.affects.length} asset affect{thesis.affects.length === 1 ? "" : "s"}
          </button>
          {affectsOpen ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {thesis.affects.map((a) => (
                <AssetAffectChip key={`${thesis.id}-${a.assetSymbol}`} affect={a} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ConvictionBar({ conviction }: { conviction: number }) {
  return <ConvictionBarInner conviction={conviction} />;
}

function ConvictionBarInner({ conviction }: { conviction: number }) {
  return <div className="h-full rounded-full bg-amber-500/60" style={{ width: `${conviction}%` }} />;
}

function ImpliedEffectRow({ effect }: { effect: ThesisCluster["impliedEffects"][0] }) {
  const arrow =
    effect.netDirection === "up" ? "↑" : effect.netDirection === "down" ? "↓" : "→";
  return (
    <>
      <ImpliedEffectHeader effect={effect} arrow={arrow} />
      <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">{effect.whyItMatters}</p>
      <p className="mt-1 text-[10px] text-zinc-600">
        From {effect.fromTheses.join(", ")} · {effect.pricedInPercent}% priced in
      </p>
      {!effect.hasDedicatedThesis ? (
        <button
          type="button"
          className="mt-2 text-[10px] font-medium text-amber-400/90 hover:text-amber-300"
          onClick={() => {}}
        >
          Create thesis →
        </button>
      ) : null}
    </>
  );
}

function ImpliedEffectHeader({
  effect,
  arrow,
}: {
  effect: ThesisCluster["impliedEffects"][0];
  arrow: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={cn(
          "text-[11px] font-semibold",
          effect.netDirection === "up"
            ? "text-emerald-400"
            : effect.netDirection === "down"
              ? "text-red-400"
              : "text-zinc-500",
        )}
      >
        {arrow} {effect.assetSymbol}
      </span>
      {effect.hasDedicatedThesis ? (
        <span className="text-[10px] text-zinc-600">Has thesis</span>
      ) : (
        <span className="text-[10px] text-amber-400/80">No thesis yet</span>
      )}
    </div>
  );
}
