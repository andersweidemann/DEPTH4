"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TABLE_GRID, ThesisRow } from "@/components/thesis-engine-v2/ThesisListRow";
import {
  filterClusterTheses,
  filterIsolatedTheses,
  type ClusterListFilter,
} from "@/lib/causal-map/cluster-list-filters";
import { cn } from "@/lib/utils";
import type { CausalGraphClustersResponse, ClusterImpliedEffect, ThesisCluster } from "@/types/causal-graph";
import type { ThesisListItem } from "@/types/thesis";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={cn("h-4 w-4 shrink-0 text-zinc-500 transition-transform", !open && "-rotate-90")}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function eventStatusPillClass(status: ThesisCluster["event"]["status"]) {
  if (status === "active") return "bg-emerald-500/10 text-emerald-400";
  if (status === "resolved") return "bg-zinc-500/10 text-zinc-400";
  return "bg-amber-500/10 text-amber-400";
}

function ImpliedEffectRow({
  effect,
  onCreateThesis,
}: {
  effect: ClusterImpliedEffect;
  onCreateThesis?: () => void;
}) {
  const arrow =
    effect.netDirection === "up" ? "↑" : effect.netDirection === "down" ? "↓" : "→";
  const arrowColor =
    effect.netDirection === "up"
      ? "text-emerald-400"
      : effect.netDirection === "down"
        ? "text-red-400"
        : "text-zinc-500";
  const moveLabel =
    effect.netDirection === "up"
      ? "Expected rise"
      : effect.netDirection === "down"
        ? "Expected fall"
        : "Neutral";

  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <span className={cn("text-[11px] font-medium", arrowColor)}>
        {arrow} {effect.assetSymbol}
      </span>
      <span className="text-[10px] text-zinc-600">
        {moveLabel}
        {effect.netStrength < 30 ? " · weak signal" : null}
      </span>
      {!effect.hasDedicatedThesis ? (
        onCreateThesis ? (
          <button
            type="button"
            onClick={onCreateThesis}
            className="ml-auto text-[10px] text-amber-400 hover:text-amber-300"
          >
            Create thesis →
          </button>
        ) : (
          <Link href="/theses" className="ml-auto text-[10px] text-amber-400 hover:text-amber-300">
            Create thesis →
          </Link>
        )
      ) : null}
    </div>
  );
}

function ClusterSection({
  cluster,
  rows,
  defaultOpen,
  emphasizeHeader,
  onToggleStar,
  onCreateThesis,
  onHideThesis,
}: {
  cluster: ThesisCluster;
  rows: ThesisListItem[];
  defaultOpen?: boolean;
  emphasizeHeader?: boolean;
  onToggleStar: (slug: string, starred: boolean) => void;
  onCreateThesis?: () => void;
  onHideThesis?: (slug: string, thesisId: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const conflictCount = cluster.conflictWarnings.length;
  const thesisLabel = `${rows.length} thesis${rows.length === 1 ? "" : "es"}`;

  return (
    <section
      className={cn(
        "rounded-lg border border-white/[0.06] bg-zinc-950/20",
        emphasizeHeader && "border-amber-500/20",
      )}
      data-testid="thesis-cluster"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <ChevronIcon open={open} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400/80">
          {cluster.event.title}
        </span>
        <span className="text-[10px] text-zinc-600">
          · {thesisLabel}
          {cluster.compositeMispricing > 0 ? ` · mispricing ${cluster.compositeMispricing}/100` : null}
          {conflictCount > 0 ? ` · ${conflictCount} conflict${conflictCount > 1 ? "s" : ""}` : null}
        </span>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[10px] capitalize",
            eventStatusPillClass(cluster.event.status),
          )}
        >
          {cluster.event.status}
        </span>
      </button>

      {open ? (
        <div className="border-t border-white/[0.06] px-4 pb-4 pt-2">
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div
                className={cn(
                  TABLE_GRID,
                  "border-b border-white/[0.06] pb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600",
                )}
              >
                <span>Thesis</span>
                <span className="text-right">Prob</span>
                <span className="hidden sm:block">Status</span>
                <span className="hidden text-right sm:block">Update</span>
                <span />
              </div>
              {rows.map((item) => (
                <ThesisRow
                  key={item.slug}
                  item={item}
                  onToggleStar={() => void onToggleStar(item.slug, item.starred)}
                  onHide={
                    onHideThesis && item.thesisId
                      ? () => onHideThesis(item.slug, item.thesisId!)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>

          {cluster.impliedEffects.length > 0 ? (
            <div className="mt-3 ml-2 border-l border-white/[0.06] pl-6 pb-1">
              <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-zinc-600">Implied effects</p>
              {cluster.impliedEffects.map((effect) => (
                <ImpliedEffectRow key={effect.id} effect={effect} onCreateThesis={onCreateThesis} />
              ))}
            </div>
          ) : null}

          {cluster.conflictWarnings.length > 0 ? (
            <div className="mt-2 rounded-md border border-red-500/20 bg-red-500/5 p-2">
              {cluster.conflictWarnings.map((w, i) => (
                <p key={i} className="text-[11px] text-red-400/80">
                  ⚠ {w.conflict}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function IsolatedSection({
  rows,
  defaultOpen,
  onToggleStar,
  onHideThesis,
}: {
  rows: ThesisListItem[];
  defaultOpen?: boolean;
  onToggleStar: (slug: string, starred: boolean) => void;
  onHideThesis?: (slug: string, thesisId: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  if (rows.length === 0) return null;

  return (
    <section className="mt-8 rounded-lg border border-white/[0.06] bg-zinc-950/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <ChevronIcon open={open} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Isolated theses
        </span>
        <span className="text-[10px] text-zinc-600">· {rows.length}</span>
      </button>
      {open ? (
        <div className="border-t border-white/[0.06] px-4 pb-4 pt-2">
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div
                className={cn(
                  TABLE_GRID,
                  "border-b border-white/[0.06] pb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600",
                )}
              >
                <span>Thesis</span>
                <span className="text-right">Prob</span>
                <span className="hidden sm:block">Status</span>
                <span className="hidden text-right sm:block">Update</span>
                <span />
              </div>
              {rows.map((item) => (
                <ThesisRow
                  key={item.slug}
                  item={item}
                  onToggleStar={() => void onToggleStar(item.slug, item.starred)}
                  onHide={
                    onHideThesis && item.thesisId
                      ? () => onHideThesis(item.slug, item.thesisId!)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function ClusteredThesesView({
  clustersPayload,
  listBySlug,
  allowedSlugs,
  activeFilter,
  emphasizeClusterHeaders,
  onToggleStar,
  onCreateThesis,
  onHideThesis,
}: {
  clustersPayload: CausalGraphClustersResponse;
  listBySlug: Map<string, ThesisListItem>;
  allowedSlugs: Set<string> | null;
  activeFilter: ClusterListFilter;
  emphasizeClusterHeaders?: boolean;
  onToggleStar: (slug: string, starred: boolean) => void;
  onCreateThesis?: () => void;
  onHideThesis?: (slug: string, thesisId: string) => void;
}) {
  const visibleClusters = useMemo(() => {
    return clustersPayload.clusters
      .map((cluster) => ({
        cluster,
        rows: filterClusterTheses(cluster, listBySlug, allowedSlugs, activeFilter),
      }))
      .filter((c) => c.rows.length > 0);
  }, [clustersPayload.clusters, listBySlug, allowedSlugs, activeFilter]);

  const isolatedRows = useMemo(
    () => filterIsolatedTheses(clustersPayload.isolated, listBySlug, allowedSlugs, activeFilter),
    [clustersPayload.isolated, listBySlug, allowedSlugs, activeFilter],
  );

  const hasClusters = clustersPayload.clusters.length > 0;
  const nothingVisible = visibleClusters.length === 0 && isolatedRows.length === 0;

  if (!hasClusters) {
    return (
      <p className="mt-8 text-[12px] text-zinc-500">
        No active events. The causal graph is building…
      </p>
    );
  }

  if (nothingVisible) {
    return <p className="mt-8 text-[12px] text-zinc-500">No theses match your filters.</p>;
  }

  return (
    <div className="mt-6 space-y-4">
      {visibleClusters.map(({ cluster, rows }, i) => (
        <ClusterSection
          key={cluster.event.id}
          cluster={cluster}
          rows={rows}
          defaultOpen={i === 0}
          emphasizeHeader={emphasizeClusterHeaders}
          onToggleStar={onToggleStar}
          onCreateThesis={onCreateThesis}
          onHideThesis={onHideThesis}
        />
      ))}
      <IsolatedSection rows={isolatedRows} onToggleStar={onToggleStar} onHideThesis={onHideThesis} />
    </div>
  );
}
