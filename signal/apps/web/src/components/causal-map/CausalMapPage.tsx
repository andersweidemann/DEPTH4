"use client";

import { useEffect, useMemo, useState } from "react";
import { CAUSAL_MAP_MOCK } from "@/lib/causal-map/causal-map-mock-data";
import { clusterHasVisibleContent } from "@/lib/causal-map/causal-map-filters";
import { ClusterCard } from "@/components/causal-map/ClusterCard";
import { CausalTreePreview } from "@/components/causal-map/CausalTreePreview";
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

export function CausalMapPage() {
  const [hidePricedIn, setHidePricedIn] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);

  const { clusters, lastUpdated } = CAUSAL_MAP_MOCK;
  const activeEvents = clusters.length;
  const totalTheses = clusters.reduce((n, c) => n + c.theses.length, 0);
  const featuredCluster = clusters[0];

  const visibleClusters = useMemo(
    () => clusters.filter((c) => clusterHasVisibleContent(c, hidePricedIn)),
    [clusters, hidePricedIn],
  );

  useEffect(() => {
    document.title = "DEPTH4 · Causal map";
  }, []);

  return (
    <div data-causal-map className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">Causal map</h1>
          <p className="mt-1 text-[13px] text-zinc-400">
            {activeEvents} active events · {totalTheses} theses · prototype mock data
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

      <p className="mt-10 border-t border-white/[0.06] pt-6 text-[11px] leading-relaxed text-zinc-600">
        Prototype only — mock data. Production will use causal_events, causal_assets, and causal_affects tables plus
        GET /api/causal-graph. Last mock refresh: {new Date(lastUpdated).toLocaleString("en-US")}.
      </p>
    </div>
  );
}
