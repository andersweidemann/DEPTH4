"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { authFetch } from "@/lib/api";
import { friendlyApiMessage } from "@/lib/api-error-message";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import { useRequireFeature } from "@/lib/thesis-engine-v2/feature-gate";
import { formatTimeAgo, getDirectionBadgeClasses, getStatusDotColor, getStatusTextColor } from "@/lib/thesis-helpers";
import { useThesisLive } from "@/lib/thesis-engine-v2/thesis-live-context";
import {
  convictionIsTemplateEstimateForThesesListItemWithLive,
  displayConvictionPctFromThesesListItemWithLive,
} from "@/lib/theses/theses-list-live-conviction";
import { isSystemThesisId } from "@/lib/thesis-engine-v2/system-thesis-ids";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeaderSkeleton, Skeleton, TableRowSkeleton } from "@/components/shared/Skeleton";
import { cn } from "@/lib/utils";
import { TrackRecordCard } from "@/components/track-record/TrackRecordCard";
import { ThesisOutcomeInlineBadge } from "@/lib/thesis/outcome-badge";
import type { TrackRecord, TrackRecordResolvedThesisRow } from "@/types/thesis-outcome";
import type { ThesisListItem, ThesisListResponse, ThesisStatus } from "@/types/thesis";
import { listRowLifecyclePresentation } from "@/lib/theses/thesis-lifecycle";
import { THESIS_CONVICTION_TEMPLATE_NOTE_SHORT } from "@/lib/thesis-engine-v2/thesis-conviction-microcopy";
import { CreateThesisModal } from "@/components/thesis-engine-v2/CreateThesisModal";
import { putUserThesisToSupabase } from "@/lib/thesis-engine-v2/sync-user-thesis-client";
import { upsertUserThesis } from "@/lib/thesis-engine-v2/user-theses";

function StarOutlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}

function StarSolidIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M10.788 3.21c.448-1.077 1.989-1.076 2.437 0l2.358 5.699 6.141.448c1.036.075 1.459 1.405.664 2.124l-4.707 4.597 1.402 6.116c.227 1.002-.848 1.781-1.726 1.302L12 18.678l-5.357 2.808c-.878.46-1.953-.3-1.726-1.302l1.402-6.116-4.707-4.597c-.795-.719-.372-2.049.664-2.124l6.141-.448 2.358-5.699z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function ProbColumn({ item, mispricing }: { item: ThesisListItem; mispricing: number }) {
  const { mergeThesis } = useThesisLive();
  const pct = Math.max(
    0,
    Math.min(100, displayConvictionPctFromThesesListItemWithLive(item, mergeThesis)),
  );
  const templateNote = convictionIsTemplateEstimateForThesesListItemWithLive(item, mergeThesis);
  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-2">
        <div className="h-1 w-12 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-amber-500/60" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[12px] font-medium text-zinc-300">
          {pct}
          <span className="text-zinc-500">%</span>
        </span>
      </div>
      <p className="mt-1 hidden text-[10px] text-zinc-600 sm:block">Mispricing {mispricing}/100</p>
      {templateNote ? (
        <p
          className="mt-1 text-[9px] leading-tight text-zinc-600"
          title={THESIS_CONVICTION_TEMPLATE_NOTE_SHORT}
          data-testid="thesis-list-template-note"
        >
          Starter template
        </p>
      ) : null}
      {process.env.NODE_ENV !== "production" ? (
        <p className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-zinc-700" aria-hidden>
          dev · row:list · {pct}%
        </p>
      ) : null}
    </div>
  );
}

export const TABLE_GRID =
  "grid grid-cols-[minmax(0,1fr)_72px_40px] gap-3 sm:grid-cols-[1fr_80px_80px_80px_40px]";

function formatListTime(isoOrText: string): string {
  if (isoOrText && !Number.isNaN(Date.parse(isoOrText))) return formatTimeAgo(isoOrText);
  return isoOrText;
}

function HomeBucketSection({
  title,
  subtitle,
  rows,
  onToggleStar,
  accent,
}: {
  title: string;
  subtitle: string;
  rows: ThesisListItem[];
  onToggleStar: (slug: string, starred: boolean) => void;
  accent?: "accent";
}) {
  return (
    <section
      className={cn(
        "mt-8 rounded-lg border border-white/[0.06] bg-zinc-950/20 p-4 sm:p-5",
        accent === "accent" && "border-[#E8473F]/25",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{title}</p>
          <p className="mt-0.5 text-[10px] text-zinc-600">{subtitle}</p>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
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
          {rows.length === 0 ? (
            <p className="mt-4 text-[12px] text-zinc-600">Nothing in this bucket for the current filters.</p>
          ) : (
            rows.map((t) => (
              <ThesisRow key={t.slug} item={t} onToggleStar={() => void onToggleStar(t.slug, t.starred)} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function statusLane(s: ThesisStatus): "ready" | "active" | "watch" {
  if (s === "Ready") return "ready";
  if (s === "Active") return "active";
  return "watch";
}

export function LiveThesesListPage() {
  useEffect(() => {
    document.title = "DEPTH4 · Live theses";
  }, []);

  const requireFeature = useRequireFeature();
  const [listTab, setListTab] = useState<"focus" | "emerging" | "monitor" | "archive">("focus");
  const [activeFilter, setActiveFilter] = useState<"all" | "starred" | "ready">("all");
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
  const homeTradable = data?.home?.tradable ?? [];
  const homeEmerging = data?.home?.emerging ?? [];
  const homeMonitoring = data?.home?.monitoring ?? [];

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
      await mutate();
      toast.success(starred ? "Thesis unstarred" : "Thesis starred");
    } catch {
      toast.error("Could not update star");
    }
  };

  if (isLoading) {
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

  if (error || !data) {
    return <ErrorBanner message={friendlyApiMessage(error)} onRetry={() => void mutate()} />;
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Live theses</h1>
          <p className="mt-1 text-[13px] text-zinc-400">
            Tradable opportunities, emerging narratives, monitoring, and recent outcomes — ranked, not capped as a
            single list. Buckets follow one blended rank (conviction, mispricing, recency, status) from the server;
            Tradable is the top ready/active slice, not a hard mispricing cliff.
          </p>
        </div>
        <button
          type="button"
          className="no-print inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 text-[12px] font-medium text-amber-400 transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]"
          onClick={() => requireFeature("createPrivateTheses", "new-thesis", () => setCreateThesisOpen(true))}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New thesis
        </button>
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
          {(["all", "starred", "ready"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]",
                activeFilter === f ? "bg-white/[0.08] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
              )}
              onClick={() => setActiveFilter(f)}
            >
              {f === "all" ? "All theses" : f === "starred" ? `Starred (${starredCount})` : "Ready only"}
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

      {listTab === "focus" ? (
        <HomeBucketSection
          title="Tradable now"
          subtitle="Top ready/active by blended rank (conviction · mispricing · recency · status), capped for focus."
          rows={homeTradable}
          accent="accent"
          onToggleStar={(slug, starred) => void toggleStar(slug, starred)}
        />
      ) : null}
      {listTab === "emerging" ? (
        <HomeBucketSection
          title="Emerging"
        subtitle="Watching and drafts — every forming-stage thesis in your current set."
        rows={homeEmerging}
        onToggleStar={(slug, starred) => void toggleStar(slug, starred)}
        />
      ) : null}
      {listTab === "monitor" ? (
        <HomeBucketSection
          title="Monitoring"
        subtitle="Still-live rows outside the top Tradable slice — includes strong ready/active that did not fit the slot cap."
        rows={homeMonitoring}
        onToggleStar={(slug, starred) => void toggleStar(slug, starred)}
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
            await mutate();
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

export function ThesisRow({ item, onToggleStar }: { item: ThesisListItem; onToggleStar: () => void }) {
  const lane = statusLane(item.status);
  const lifecyclePresentation = item.lifecycle_state
    ? listRowLifecyclePresentation({ status: item.status, lifecycle_state: item.lifecycle_state })
    : null;
  return (
    <div className={cn(TABLE_GRID, "items-start border-b border-white/[0.06] py-4")}>
      <div>
        <p className="text-[10px] text-zinc-500">{item.asset}</p>
        {item.detailResolvable ? (
          <Link
            href={`/theses/${item.slug}`}
            className="mt-0.5 block text-[13px] font-medium text-zinc-100 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
          >
            {item.title}
          </Link>
        ) : (
          <p className="mt-0.5 text-[13px] font-medium text-zinc-300">{item.title}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase",
              getDirectionBadgeClasses(item.direction),
            )}
          >
            {item.direction}
          </span>
          {lane === "watch" ? (
            <span className="rounded-full border border-zinc-600/30 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-400">
              watch
            </span>
          ) : lane === "ready" ? (
            <span className="rounded-full border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-400">
              ready
            </span>
          ) : (
            <span className="rounded-full border border-zinc-600/30 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-400">
              active
            </span>
          )}
        </div>
        {item.whyNow?.trim() ? (
          <p className="mt-1.5 max-w-lg line-clamp-2 text-[11px] leading-relaxed text-zinc-500">{item.whyNow}</p>
        ) : null}
        {item.outcome ? (
          <div className="mt-1.5">
            <ThesisOutcomeInlineBadge outcome={item.outcome} />
          </div>
        ) : item.outcome_label ? (
          <p className="mt-1.5 text-[10px] text-zinc-500">
            Outcome · <span className="text-zinc-300">{item.outcome_label}</span>
          </p>
        ) : null}
      </div>
      <ProbColumn mispricing={item.mispricingScore} item={item} />
      <div className="hidden sm:block">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[10px] uppercase",
            lifecyclePresentation?.textClass ?? getStatusTextColor(item.status),
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              lifecyclePresentation?.dotClass ?? getStatusDotColor(item.status),
            )}
          />
          {lifecyclePresentation?.label ?? item.status}
        </span>
      </div>
      <div className="hidden text-right sm:block">
        <span className="text-[11px] text-zinc-500">{formatListTime(item.lastUpdated)}</span>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onToggleStar}
          className="no-print text-zinc-600 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
          aria-label={item.starred ? "Unstar thesis" : "Star thesis"}
        >
          {item.starred ? (
            <StarSolidIcon className="h-4 w-4 fill-amber-400 text-amber-400" />
          ) : (
            <StarOutlineIcon className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
