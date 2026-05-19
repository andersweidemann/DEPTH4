"use client";

import { useEffect, useMemo, useState } from "react";
import { filterCluster, filterThesis } from "@/lib/causal-map/causal-map-filters";
import { deriveClusterTitle } from "@/lib/causal-map/derive-cluster-title";
import { ThesisMapCard } from "@/components/causal-map/ThesisMapCard";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeaderSkeleton, Skeleton } from "@/components/shared/Skeleton";
import type { CausalEvent, CausalGraphClustersResponse, ThesisCluster } from "@/types/causal-graph";
import { cn } from "@/lib/utils";

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
  title,
}: {
  label: string;
  pressed: boolean;
  onChange: (v: boolean) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={cn(
        "rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]",
        pressed
          ? "border-[#E8473F]/40 bg-[#E8473F]/10 text-[#E8473F]"
          : "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
      )}
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
    >
      {label}
    </button>
  );
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

  useEffect(() => {
    document.title = "DEPTH4 · Causal map";
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/causal-graph/clusters", { credentials: "include" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
          throw new Error(body.message || body.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as CausalGraphClustersResponse;
        if (!cancelled) setGraph(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load causal map");
          setGraph(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeEvents = graph?.activeEvents ?? 0;
  const totalTheses = graph?.totalTheses ?? 0;

  const visibleClusters = useMemo(() => {
    const clusters = graph?.clusters ?? [];
    return clusters
      .map((c) => filterCluster(c, hidePricedIn))
      .filter((c) => c.theses.length > 0)
      .map(sortThesesByEdge);
  }, [graph?.clusters, hidePricedIn]);

  const visibleIsolated = useMemo(() => {
    const isolated = graph?.isolated ?? [];
    return isolated
      .filter((t) => filterThesis(t, hidePricedIn))
      .sort((a, b) => b.mispricingScore - a.mispricingScore);
  }, [graph?.isolated, hidePricedIn]);

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
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">Causal map</h1>
          <p className="mt-1 text-[13px] text-zinc-400">
            {activeEvents} active events · {totalTheses} theses · live data
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">Click a thesis to see the full causal chain.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ToggleButton
            label="Hide priced-in"
            pressed={hidePricedIn}
            onChange={setHidePricedIn}
            title="Hide theses with mispricing below 30 and affects above 80% priced in"
          />
          <ToggleButton
            label="Show conflicts"
            pressed={showConflicts}
            onChange={setShowConflicts}
            title="Highlight clusters with contradictory theses"
          />
        </div>
      </div>

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
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Isolated theses
              </p>
              <div className="space-y-2">
                {visibleIsolated.map((thesis) => (
                  <ThesisMapCard
                    key={thesis.slug}
                    thesis={thesis}
                    rootEvent={ISOLATED_EVENT}
                    isExpanded={expandedThesis === thesis.slug}
                    onToggle={() => setExpandedThesis((cur) => (cur === thesis.slug ? null : thesis.slug))}
                    hidePricedIn={hidePricedIn}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {graph?.lastUpdated ? (
        <p className="mt-10 border-t border-white/[0.06] pt-6 text-[11px] leading-relaxed text-zinc-600">
          Live causal graph from Supabase. Last updated{" "}
          {new Date(graph.lastUpdated).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          .
        </p>
      ) : null}
    </div>
  );
}
