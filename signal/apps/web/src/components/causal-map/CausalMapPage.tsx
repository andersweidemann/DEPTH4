"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  countVisibleConflicts,
  filterCluster,
  filterIsolatedTheses,
  isolatedConflictWarningsFor,
  PRICED_IN_HIDE_THRESHOLD,
  thesisInConflictWarnings,
} from "@/lib/causal-map/causal-map-filters";
import { deriveClusterTitle } from "@/lib/causal-map/derive-cluster-title";
import { ThesisMapCard } from "@/components/causal-map/ThesisMapCard";
import { CreateThesisModal } from "@/components/thesis-engine-v2/CreateThesisModal";
import { ThesisToast, type ThesisToastType } from "@/components/toast/ThesisToast";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeaderSkeleton, Skeleton } from "@/components/shared/Skeleton";
import { authFetch } from "@/lib/api";
import { putUserThesisToSupabase } from "@/lib/thesis-engine-v2/sync-user-thesis-client";
import { upsertUserThesis } from "@/lib/thesis-engine-v2/user-theses";
import type { CausalEvent, CausalGraphClustersResponse, CausalThesis, ThesisCluster } from "@/types/causal-graph";
import { cn } from "@/lib/utils";

const SEEN_THESIS_SLUGS_KEY = "depth4_theses_seen_slugs_v1";

const ISOLATED_EVENT: CausalEvent = {
  id: "isolated",
  slug: "isolated",
  title: "No linked event",
  description: "",
  category: "geopolitics",
  status: "active",
  confidence: 0,
  firstDetected: new Date().toISOString(),
};

function ToggleButton({
  label,
  pressed,
  onChange,
  className,
}: {
  label: string;
  pressed: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]",
        className ??
          (pressed
            ? "border-[#E8473F]/40 bg-[#E8473F]/10 text-[#E8473F]"
            : "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"),
      )}
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
    >
      {label}
    </button>
  );
}

function minutesSince(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / 60_000;
}

function formatTimeAgo(iso: string): string {
  const mins = minutesSince(iso);
  if (!Number.isFinite(mins)) return "unknown";
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)}m ago`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.round(hrs)}h ago`;
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sortThesesByEdge(cluster: ThesisCluster): ThesisCluster {
  return {
    ...cluster,
    theses: [...cluster.theses].sort((a, b) => b.mispricingScore - a.mispricingScore),
  };
}

function ThesisListSkeleton() {
  return (
    <div className="mt-8 space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function CausalMapPage() {
  const [hidePricedIn, setHidePricedIn] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  const [graph, setGraph] = useState<CausalGraphClustersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedThesis, setExpandedThesis] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [toast, setToast] = useState<{ thesis: CausalThesis; type: ThesisToastType } | null>(null);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/causal-graph/clusters", { credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as CausalGraphClustersResponse;
      setGraph(data);

      const allTheses = [
        ...data.clusters.flatMap((c) => c.theses),
        ...data.isolated,
      ];
      const slugs = allTheses.map((t) => t.slug);
      let prev: string[] = [];
      try {
        prev = JSON.parse(sessionStorage.getItem(SEEN_THESIS_SLUGS_KEY) ?? "[]") as string[];
      } catch {
        prev = [];
      }
      if (prev.length > 0) {
        const newcomer = allTheses.find((t) => !prev.includes(t.slug));
        if (newcomer) setToast({ thesis: newcomer, type: "new" });
      }
      sessionStorage.setItem(SEEN_THESIS_SLUGS_KEY, JSON.stringify(slugs));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load theses");
      setGraph(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "DEPTH4 · Theses";
  }, []);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  const recentUpdateIds = useMemo(
    () => new Set(graph?.recentlyUpdatedThesisIds ?? []),
    [graph?.recentlyUpdatedThesisIds],
  );

  const hideThesis = useCallback(
    async (thesisId: string) => {
      const res = await authFetch("/api/user/hidden-theses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesisId }),
      });
      if (!res.ok) return;
      setGraph((g) => {
        if (!g) return g;
        const clusters = g.clusters
          .map((c) => ({ ...c, theses: c.theses.filter((t) => t.id !== thesisId) }))
          .filter((c) => c.theses.length > 0);
        const isolated = g.isolated.filter((t) => t.id !== thesisId);
        return {
          ...g,
          clusters,
          isolated,
          totalTheses: clusters.reduce((n, c) => n + c.theses.length, 0) + isolated.length,
        };
      });
    },
    [],
  );

  const totalTheses = graph?.totalTheses ?? 0;

  const visibleClusters = useMemo(() => {
    const clusters = graph?.clusters ?? [];
    return clusters
      .map((c) => filterCluster(c, hidePricedIn, showConflicts))
      .filter((c) => c.theses.length > 0)
      .map(sortThesesByEdge);
  }, [graph?.clusters, hidePricedIn, showConflicts]);

  const visibleIsolated = useMemo(() => {
    const isolated = graph?.isolated ?? [];
    return filterIsolatedTheses(isolated, hidePricedIn, showConflicts).sort(
      (a, b) => b.mispricingScore - a.mispricingScore,
    );
  }, [graph?.isolated, hidePricedIn, showConflicts]);

  const isolatedConflicts = useMemo(
    () => isolatedConflictWarningsFor(graph?.isolated ?? []),
    [graph?.isolated],
  );

  const visibleConflictCount = useMemo(() => {
    if (!showConflicts || !graph) return 0;
    return countVisibleConflicts(graph.clusters, graph.isolated, hidePricedIn, true);
  }, [graph, hidePricedIn, showConflicts]);

  if (loading) {
    return (
      <div data-causal-map className="mx-auto max-w-6xl">
        <PageHeaderSkeleton />
        <ThesisListSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div data-causal-map className="mx-auto max-w-6xl">
        <ErrorBanner message={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const nothingVisible = visibleClusters.length === 0 && visibleIsolated.length === 0;

  return (
    <div data-causal-map className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">Theses</h1>
          <p className="mt-1 text-[13px] text-zinc-400">
            {visibleClusters.length} clusters · {totalTheses} active · Last updated{" "}
            {graph?.lastUpdated ? formatTimeAgo(graph.lastUpdated) : "—"}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
            <Link href="/theses?list=1" className="text-zinc-500 hover:text-zinc-300">
              List view
            </Link>
            <Link href="/theses/archive" className="text-zinc-500 hover:text-zinc-300">
              Archive
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
          >
            <span className="text-[14px]" aria-hidden>
              +
            </span>
            Create thesis
          </button>
          <ToggleButton
            label={
              hidePricedIn
                ? `✓ Hiding priced-in (>${PRICED_IN_HIDE_THRESHOLD}%)`
                : `Hide priced-in (>${PRICED_IN_HIDE_THRESHOLD}%)`
            }
            pressed={hidePricedIn}
            onChange={setHidePricedIn}
            className={
              hidePricedIn
                ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                : "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
            }
          />
          <ToggleButton
            label={showConflicts ? "⚠ Showing conflicts" : "Show conflicts"}
            pressed={showConflicts}
            onChange={setShowConflicts}
            className={
              showConflicts
                ? "border-red-500/30 bg-red-500/10 text-red-400"
                : "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
            }
          />
        </div>
      </div>

      {showConflicts && visibleConflictCount === 0 ? (
        <div className="mb-6 rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-center">
          <p className="text-[11px] text-amber-400">No conflicts detected among visible theses</p>
          <p className="mt-1 text-[10px] text-zinc-500">
            Conflicts appear when theses in the same event cluster (or isolated group on the same asset) pull in opposite
            directions
          </p>
        </div>
      ) : null}

      {(graph?.dailyUpdates?.length ?? 0) > 0 ? (
        <div
          id="updates"
          className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3"
        >
          <p className="text-[11px] text-blue-400">
            ↻ {graph!.dailyUpdates!.length} thesis{graph!.dailyUpdates!.length > 1 ? "es" : ""} updated today:{" "}
            {graph!.dailyUpdates!.map((u) => u.thesisTitle).join(", ")}
          </p>
        </div>
      ) : null}

      {nothingVisible ? (
        <p className="mt-10 text-[13px] text-zinc-500">
          No theses match the current filters. Try turning off &quot;Hide priced-in&quot; or link theses to events in
          the causal graph.
        </p>
      ) : (
        <div className="space-y-8">
          {visibleClusters.map((cluster) => {
            const hasConflicts = cluster.conflictWarnings.length > 0;
            const clusterTitle = deriveClusterTitle(cluster);
            return (
              <section key={cluster.event.id}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-[0.14em]",
                      showConflicts && hasConflicts ? "text-red-400" : "text-[#E8473F]/90",
                    )}
                  >
                    {clusterTitle}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    · {cluster.theses.length} thesis{cluster.theses.length === 1 ? "" : "es"}
                    {hasConflicts ? ` · ${cluster.conflictWarnings.length} conflict${cluster.conflictWarnings.length === 1 ? "" : "s"}` : ""}
                  </span>
                </div>

                <div className="space-y-2">
                  {cluster.theses.map((thesis) => (
                    <ThesisMapCard
                      key={thesis.slug}
                      thesis={thesis}
                      rootEvent={cluster.event}
                      clusterTitle={clusterTitle}
                      isExpanded={expandedThesis === thesis.slug}
                      onToggle={() =>
                        setExpandedThesis((cur) => (cur === thesis.slug ? null : thesis.slug))
                      }
                      hidePricedIn={hidePricedIn}
                      showConflicts={showConflicts}
                      hasConflict={thesisInConflictWarnings(thesis, cluster.conflictWarnings)}
                      hasRecentUpdate={recentUpdateIds.has(thesis.id)}
                      onHide={() => void hideThesis(thesis.id)}
                    />
                  ))}
                </div>

                {hasConflicts ? (
                  <div className="mt-2 space-y-1 rounded-md border border-red-500/20 bg-red-500/5 p-2">
                    {cluster.conflictWarnings.map((w, i) => (
                      <p key={`${w.thesisA}-${i}`} className="text-[11px] text-red-400/80">
                        ⚠ {w.conflict}
                      </p>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}

          {visibleIsolated.length > 0 ? (
            <section>
              <div className="space-y-2">
                {isolatedConflicts.length > 0 ? (
                  <div className="mb-2 space-y-1 rounded-md border border-red-500/20 bg-red-500/5 p-2">
                    {isolatedConflicts.map((w, i) => (
                      <p key={`iso-${w.thesisA}-${i}`} className="text-[11px] text-red-400/80">
                        ⚠ {w.conflict}
                      </p>
                    ))}
                  </div>
                ) : null}
                {visibleIsolated.map((thesis) => {
                  const isoConflict = isolatedConflicts.some(
                    (w) => w.thesisA === thesis.title || w.thesisB === thesis.title,
                  );
                  return (
                    <ThesisMapCard
                      key={thesis.slug}
                      thesis={thesis}
                      rootEvent={ISOLATED_EVENT}
                      isExpanded={expandedThesis === thesis.slug}
                      onToggle={() => setExpandedThesis((cur) => (cur === thesis.slug ? null : thesis.slug))}
                      hidePricedIn={hidePricedIn}
                      showConflicts={showConflicts}
                      hasConflict={isoConflict}
                      noCluster
                      hasRecentUpdate={recentUpdateIds.has(thesis.id)}
                      onHide={() => void hideThesis(thesis.id)}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {graph?.lastUpdated ? (
        <div className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-6 text-[10px] text-zinc-600">
          <span>Live causal graph from Supabase</span>
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                minutesSince(graph.lastUpdated) < 5
                  ? "bg-emerald-500"
                  : minutesSince(graph.lastUpdated) < 60
                    ? "bg-amber-500"
                    : "bg-red-500",
              )}
              aria-hidden
            />
            Last updated {formatTimeAgo(graph.lastUpdated)}
            {minutesSince(graph.lastUpdated) < 5 ? " · Live" : null}
          </span>
        </div>
      ) : null}

      {toast ? (
        <ThesisToast thesis={toast.thesis} type={toast.type} onDismiss={() => setToast(null)} />
      ) : null}

      <CreateThesisModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onCreate={(t) => {
          upsertUserThesis(t);
          setCreateModalOpen(false);
          void putUserThesisToSupabase(t).then(() => loadGraph());
        }}
      />
    </div>
  );
}
