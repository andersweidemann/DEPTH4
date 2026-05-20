"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { authFetch } from "@/lib/api";
import { friendlyApiMessage } from "@/lib/api-error-message";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import { useRequireFeature } from "@/lib/thesis-engine-v2/feature-gate";
import { formatTimeAgo, inferAssetClassFromTicker } from "@/lib/thesis-helpers";
import { isSystemThesisId } from "@/lib/thesis-engine-v2/system-thesis-ids";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeaderSkeleton, Skeleton, TableRowSkeleton } from "@/components/shared/Skeleton";
import { cn } from "@/lib/utils";
import { TrackRecordCard } from "@/components/track-record/TrackRecordCard";
import { ThesisOutcomeInlineBadge } from "@/lib/thesis/outcome-badge";
import type { TrackRecord, TrackRecordResolvedThesisRow } from "@/types/thesis-outcome";
import type { CausalGraphClustersResponse } from "@/types/causal-graph";
import type { ThesisListItem, ThesisListResponse } from "@/types/thesis";
import type { ClusterListFilter } from "@/lib/causal-map/cluster-list-filters";
import { ClusteredThesesView } from "@/components/thesis-engine-v2/ClusteredThesesView";
import { TABLE_GRID } from "@/components/thesis-engine-v2/ThesisListRow";
import { CreateThesisModal } from "@/components/thesis-engine-v2/CreateThesisModal";
import { putUserThesisToSupabase } from "@/lib/thesis-engine-v2/sync-user-thesis-client";
import { usePublicReadOnlyWorkspace } from "@/hooks/use-public-read-only-workspace";
import { upsertUserThesis } from "@/lib/thesis-engine-v2/user-theses";
import { hideThesisBySlug } from "@/lib/thesis-engine-v2/user-hidden-theses-client";

export { ThesisRow, TABLE_GRID } from "@/components/thesis-engine-v2/ThesisListRow";

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function formatListTime(isoOrText: string): string {
  if (isoOrText && !Number.isNaN(Date.parse(isoOrText))) return formatTimeAgo(isoOrText);
  return isoOrText;
}

export function LiveThesesListPage() {
  useEffect(() => {
    document.title = "DEPTH4 · Theses · List view";
  }, []);

  const requireFeature = useRequireFeature();
  const publicReadOnly = usePublicReadOnlyWorkspace();
  const [listTab, setListTab] = useState<"focus" | "emerging" | "monitor" | "archive">("focus");
  const [activeFilter, setActiveFilter] = useState<ClusterListFilter | "by_cluster">("all");
  const [assetClass, setAssetClass] = useState("All");
  const [createThesisOpen, setCreateThesisOpen] = useState(false);

  const listKey = useMemo(() => {
    const params = new URLSearchParams();
    if (activeFilter === "starred") params.set("starred", "true");
    if (activeFilter === "ready") params.set("status", "Ready");
    if (assetClass !== "All") params.set("assetClass", assetClass);
    /** Omit `sort`: bucket membership + in-bucket order come from the server; client resort was scrambling rank. */
    const qs = params.toString();
    return `/api/theses${qs ? `?${qs}` : ""}`;
  }, [activeFilter, assetClass]);

  const { data, error, isLoading, mutate } = useSWR<ThesisListResponse>(listKey, swrJsonFetcher);
  const {
    data: clustersPayload,
    error: clustersError,
    isLoading: clustersLoading,
    mutate: mutateClusters,
  } = useSWR<CausalGraphClustersResponse>(
    listTab === "archive" ? null : "/api/causal-graph/clusters",
    swrJsonFetcher,
  );
  const { data: trackRecord } = useSWR<TrackRecord>(
    listTab === "archive" ? "/api/track-record" : null,
    swrJsonFetcher,
  );

  const warnedStaleListTriple = useRef(false);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !data || warnedStaleListTriple.current) return;
    const rows = data?.home
      ? [...data.home.tradable, ...data.home.emerging, ...data.home.monitoring, ...data.home.archivePreview]
      : [...(data?.focus ?? []), ...(data?.monitor ?? [])];
    const missing = rows.filter((r) => r.thesisId && isSystemThesisId(r.thesisId) && !r.listBaselineScenarioTriple);
    if (missing.length > 0) {
      warnedStaleListTriple.current = true;
      console.warn(
        "[DEPTH4] Stale /api/theses payload: catalog rows without `listBaselineScenarioTriple`. The client will infer triples from catalog defaults; refetch after deploy so list + detail stay aligned with the server baseline.",
        { count: missing.length, exampleSlugs: missing.slice(0, 5).map((r) => r.slug) },
      );
    }
  }, [data]);

  /** Preserve `/api/theses` bucket order — do not re-sort by recency/conviction/mispricing here (that broke ranked slots). */
  const homeTradable = useMemo(() => data?.home?.tradable ?? [], [data?.home?.tradable]);
  const homeEmerging = useMemo(() => data?.home?.emerging ?? [], [data?.home?.emerging]);
  const homeMonitoring = useMemo(() => data?.home?.monitoring ?? [], [data?.home?.monitoring]);

  const listBySlug = useMemo(() => {
    const map = new Map<string, ThesisListItem>();
    if (!data) return map;
    const all = [
      ...homeTradable,
      ...homeEmerging,
      ...homeMonitoring,
      ...(data.home?.archivePreview ?? []),
      ...(data.focus ?? []),
      ...(data.monitor ?? []),
    ];
    for (const item of all) {
      if (assetClass !== "All" && inferAssetClassFromTicker(item.asset) !== assetClass) continue;
      map.set(item.slug, item);
    }
    return map;
  }, [data, homeTradable, homeEmerging, homeMonitoring, assetClass]);

  const allowedSlugs = useMemo(() => {
    if (listTab === "archive") return null;
    const rows =
      listTab === "focus"
        ? homeTradable
        : listTab === "emerging"
          ? homeEmerging
          : listTab === "monitor"
            ? homeMonitoring
            : null;
    if (!rows || rows.length === 0) {
      return listBySlug.size > 0 ? new Set(listBySlug.keys()) : null;
    }
    return new Set(rows.map((r) => r.slug));
  }, [listTab, homeTradable, homeEmerging, homeMonitoring, listBySlug]);

  const clusterFilter: ClusterListFilter =
    activeFilter === "by_cluster" ? "all" : activeFilter;

  const starredCount = useMemo(() => {
    if (!data) return 0;
    if (data.home) {
      const all = [
        ...data.home.tradable,
        ...data.home.emerging,
        ...data.home.monitoring,
        ...data.home.archivePreview,
      ];
      return all.filter((t) => t.starred).length;
    }
    return [...data.focus, ...data.monitor].filter((t) => t.starred).length;
  }, [data]);

  const toggleStar = async (slug: string, starred: boolean) => {
    try {
      await authFetch(`/api/theses/${slug}/star`, { method: "POST" });
      await Promise.all([mutate(), mutateClusters()]);
      toast.success(starred ? "Thesis unstarred" : "Thesis starred");
    } catch {
      toast.error("Could not update star");
    }
  };

  const hideThesis = async (slug: string) => {
    if (publicReadOnly) return;
    const ok = await hideThesisBySlug(slug);
    if (!ok) {
      toast.error("Could not hide thesis");
      return;
    }
    toast.success("Hidden from view");
    await Promise.all([mutate(), mutateClusters()]);
  };

  const pageLoading = isLoading || (listTab !== "archive" && clustersLoading);

  if (pageLoading) {
    return (
      <div className="pb-8">
        <PageHeaderSkeleton />
        <div className="mt-6 flex flex-wrap gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
        <section className="mt-8">
          <Skeleton className="h-2.5 w-28" />
          <div className="mt-3 space-y-0">
            <TableRowSkeleton />
            <TableRowSkeleton />
          </div>
        </section>
        <section className="mt-8">
          <Skeleton className="h-2.5 w-24" />
          <div className="mt-3 space-y-0">
            <TableRowSkeleton />
            <TableRowSkeleton />
          </div>
        </section>
        <section className="mt-8">
          <Skeleton className="h-2.5 w-20" />
          <div className="mt-3 space-y-0">
            <TableRowSkeleton />
            <TableRowSkeleton />
          </div>
        </section>
        <section className="mt-8">
          <Skeleton className="h-2.5 w-32" />
          <div className="mt-3 space-y-0">
            <TableRowSkeleton />
          </div>
        </section>
      </div>
    );
  }

  if (error || !data || (listTab !== "archive" && (clustersError || !clustersPayload))) {
    const err = error ?? clustersError;
    return (
      <ErrorBanner
        message={friendlyApiMessage(err)}
        onRetry={() => void Promise.all([mutate(), mutateClusters()])}
      />
    );
  }

  const clusterCount = clustersPayload?.clusters.length ?? 0;
  const listThesisCount = listBySlug.size;
  const thesisCount = listThesisCount > 0 ? listThesisCount : (clustersPayload?.totalTheses ?? 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
          <h1 className="text-xl font-semibold text-zinc-50">Thesis map</h1>
          {listTab !== "archive" && clustersPayload ? (
            <p className="mt-1 text-[12px] text-zinc-500">
              Active events: {clustersPayload.activeEvents} · Theses: {thesisCount} · Clusters: {clusterCount}
            </p>
          ) : (
            <p className="mt-1 text-[13px] text-zinc-400">Resolved theses and track record.</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {listTab !== "archive" ? (
            <>
              <Link href="/theses" className="text-[11px] text-zinc-400 transition-colors hover:text-amber-400">
                Card view →
              </Link>
              <Link href="/theses?hidden=1" className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300">
                Hidden
              </Link>
            </>
          ) : null}
          {!publicReadOnly ? (
            <button
              type="button"
              className="no-print inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 text-[12px] font-medium text-amber-400 transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]"
              onClick={() => requireFeature("createPrivateTheses", "new-thesis", () => setCreateThesisOpen(true))}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              New thesis
            </button>
          ) : null}
        </div>
      </div>

      <div className="no-print mt-4 flex flex-wrap gap-1">
        {(
          [
            ["focus", "Focus"],
            ["monitor", "Monitor"],
            ["emerging", "Emerging"],
            ["archive", "Archive"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]",
              listTab === id ? "bg-white/[0.08] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
            )}
            onClick={() => setListTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {(
            [
              ["all", "All"],
              ["starred", `Starred (${starredCount})`],
              ["ready", "Ready"],
              ["by_cluster", "By cluster"],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]",
                activeFilter === f ? "bg-white/[0.08] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
              )}
              onClick={() => setActiveFilter(f)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Asset class</label>
            <select
              className="rounded-md border border-white/[0.08] bg-zinc-900/50 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-white/[0.12] focus:outline-none focus:ring-2 focus:ring-slate-400"
              value={assetClass}
              onChange={(e) => setAssetClass(e.target.value)}
            >
              {["All", "Equity", "Rates", "FX", "Commodities", "Crypto"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {listTab !== "archive" && clustersPayload ? (
        <ClusteredThesesView
          clustersPayload={clustersPayload}
          listBySlug={listBySlug}
          allowedSlugs={allowedSlugs}
          activeFilter={clusterFilter}
          emphasizeClusterHeaders={activeFilter === "by_cluster"}
          onToggleStar={(slug, starred) => void toggleStar(slug, starred)}
          onHideThesis={publicReadOnly ? undefined : (slug) => void hideThesis(slug)}
          onCreateThesis={() =>
            requireFeature("createPrivateTheses", "new-thesis", () => setCreateThesisOpen(true))
          }
        />
      ) : null}
      {listTab === "archive" ? (
        <section className="mt-8 space-y-4">
          {trackRecord ? (
            <>
              <TrackRecordCard trackRecord={trackRecord} />
              <div className="mb-4 flex flex-wrap gap-4 text-[11px] text-zinc-400">
                <span>{trackRecord.total} resolved</span>
                <span className="text-emerald-400">{trackRecord.wonClean + trackRecord.wonMessy} won</span>
                <span className="text-red-400">{trackRecord.failed} failed</span>
                <span className="text-zinc-500">{trackRecord.expired} expired</span>
                <span className="ml-auto font-medium text-zinc-300">{trackRecord.winRate}% win rate</span>
              </div>
              {trackRecord.total > 0 ? (
                <div className="mb-6 flex h-2 gap-0.5 overflow-hidden rounded-full">
                  {(() => {
                    const t = Math.max(trackRecord.total, 1);
                    const wonCleanPct = (trackRecord.wonClean / t) * 100;
                    const wonMessyPct = (trackRecord.wonMessy / t) * 100;
                    const failedPct = (trackRecord.failed / t) * 100;
                    const expiredPct = (trackRecord.expired / t) * 100;
                    return (
                      <>
                        {wonCleanPct > 0 ? <div className="bg-emerald-500" style={{ width: `${wonCleanPct}%` }} /> : null}
                        {wonMessyPct > 0 ? <div className="bg-emerald-400" style={{ width: `${wonMessyPct}%` }} /> : null}
                        {failedPct > 0 ? <div className="bg-red-500" style={{ width: `${failedPct}%` }} /> : null}
                        {expiredPct > 0 ? <div className="bg-zinc-600" style={{ width: `${expiredPct}%` }} /> : null}
                      </>
                    );
                  })()}
                </div>
              ) : null}
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div
                    className={cn(
                      TABLE_GRID,
                      "border-b border-white/[0.06] pb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600",
                    )}
                  >
                    <span>Thesis</span>
                    <span className="text-right">Outcome</span>
                    <span className="hidden sm:block">Hold</span>
                    <span className="hidden text-right sm:block">Resolved</span>
                    <span />
                  </div>
                  {trackRecord.resolvedTheses.length === 0 ? (
                    <p className="mt-4 text-[12px] text-zinc-600">No resolved theses yet.</p>
                  ) : (
                    trackRecord.resolvedTheses.map((r) => <ArchiveOutcomeRow key={r.slug} row={r} />)
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-[12px] text-zinc-500">Loading track record…</p>
          )}
        </section>
      ) : null}

      <CreateThesisModal
        open={createThesisOpen}
        onOpenChange={setCreateThesisOpen}
        onCreate={(t) => {
          upsertUserThesis(t);
          void putUserThesisToSupabase(t).then(async (r) => {
            if (!r.ok) {
              toast.error(
                r.error === "sign_in_required"
                  ? "Sign in to save this thesis to your account."
                  : friendlyApiMessage(r.error),
              );
              return;
            }
            await Promise.all([mutate(), mutateClusters()]);
            toast.success("Thesis created");
          });
        }}
      />
    </>
  );
}

function ArchiveOutcomeRow({ row }: { row: TrackRecordResolvedThesisRow }) {
  return (
    <div className={cn(TABLE_GRID, "items-start border-b border-white/[0.06] py-4")}>
      <div>
        <p className="text-[10px] text-zinc-500">{row.asset}</p>
        <Link
          href={`/theses/${row.slug}`}
          className="mt-0.5 block text-[13px] font-medium text-zinc-100 transition-colors hover:text-amber-400"
        >
          {row.title}
        </Link>
        <div className="mt-1.5 sm:hidden">
          <ThesisOutcomeInlineBadge outcome={row.outcome} />
        </div>
      </div>
      <div className="hidden text-right sm:block">
        <ThesisOutcomeInlineBadge outcome={row.outcome} />
      </div>
      <div className="hidden text-[11px] text-zinc-400 sm:block">
        {row.holdDurationDays != null ? `${row.holdDurationDays}d` : "—"}
      </div>
      <div className="hidden text-right text-[11px] text-zinc-500 sm:block">
        {formatListTime(row.resolvedAt)}
      </div>
      <span />
    </div>
  );
}
