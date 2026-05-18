"use client";

import { useEffect, useMemo, useState } from "react";
import { clusterHasVisibleContent } from "@/lib/causal-map/causal-map-filters";
import { ClusterCard } from "@/components/causal-map/ClusterCard";
import { CausalTreePreview } from "@/components/causal-map/CausalTreePreview";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeaderSkeleton, Skeleton } from "@/components/shared/Skeleton";
import type { GlobalCausalGraph } from "@/types/causal-graph";
import { cn } from "@/lib/utils";

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

function ClusterGridSkeleton() {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

export function CausalMapPage() {
  const [hidePricedIn, setHidePricedIn] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  const [graph, setGraph] = useState<GlobalCausalGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "DEPTH4 · Causal map";
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/causal-graph", { credentials: "include" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
          throw new Error(body.message || body.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as GlobalCausalGraph;
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

  const clusters = graph?.clusters ?? [];
  const activeEvents = graph?.activeEvents ?? 0;
  const totalTheses = graph?.totalTheses ?? 0;
  const featuredCluster = clusters[0];

  const visibleClusters = useMemo(
    () => clusters.filter((c) => clusterHasVisibleContent(c, hidePricedIn)),
    [clusters, hidePricedIn],
  );

  if (loading) {
    return (
      <div data-causal-map className="mx-auto max-w-6xl">
        <PageHeaderSkeleton />
        <div className="mt-8">
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
        <ClusterGridSkeleton />
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

  return (
    <div data-causal-map className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">Causal map</h1>
          <p className="mt-1 text-[13px] text-zinc-400">
            {activeEvents} active events · {totalTheses} theses · live data
          </p>
          <p className="mt-1 text-[11px] text-zinc-600">
            Theses are edges between events and assets — not isolated documents.
          </p>
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

      {clusters.length === 0 ? (
        <p className="mt-10 text-[13px] text-zinc-500">
          No active macro events in the causal graph yet. Run the causal graph migration and link theses to events.
        </p>
      ) : (
        <>
          {featuredCluster ? (
            <section className="mt-8">
              <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Featured causal chain
              </h2>
              <CausalTreePreview cluster={featuredCluster} hidePricedIn={hidePricedIn} />
            </section>
          ) : null}

          <section className="mt-10">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Event clusters</h2>
            {visibleClusters.length === 0 ? (
              <p className="mt-4 text-[13px] text-zinc-500">No clusters match the current filters.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {visibleClusters.map((cluster) => (
                  <ClusterCard
                    key={cluster.event.id}
                    cluster={cluster}
                    hidePricedIn={hidePricedIn}
                    highlightConflicts={showConflicts}
                  />
                ))}
              </div>
            )}
          </section>
        </>
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
