"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { authFetch } from "@/lib/api";
import { friendlyApiMessage } from "@/lib/api-error-message";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import { useRequireFeature } from "@/lib/thesis-engine-v2/feature-gate";
import { formatTimeAgo, getDirectionBadgeClasses, getStatusDotColor, getStatusTextColor } from "@/lib/thesis-helpers";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeaderSkeleton, Skeleton, TableRowSkeleton } from "@/components/shared/Skeleton";
import { cn } from "@/lib/utils";
import type { ThesisListItem, ThesisListResponse, ThesisStatus } from "@/types/thesis";
import { displayConvictionPctFromListItem } from "@/lib/thesis-engine-v2/thesis-display-selectors";

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
  const pct = Math.max(0, Math.min(100, displayConvictionPctFromListItem(item)));
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
      {process.env.NODE_ENV !== "production" ? (
        <p className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-zinc-700" aria-hidden>
          dev · row:list · {pct}%
        </p>
      ) : null}
    </div>
  );
}

const TABLE_GRID =
  "grid grid-cols-[minmax(0,1fr)_72px_40px] gap-3 sm:grid-cols-[1fr_80px_80px_80px_40px]";

function formatListTime(isoOrText: string): string {
  if (isoOrText && !Number.isNaN(Date.parse(isoOrText))) return formatTimeAgo(isoOrText);
  return isoOrText;
}

function statusLane(s: ThesisStatus): "ready" | "active" | "watch" {
  if (s === "Ready") return "ready";
  if (s === "Active") return "active";
  return "watch";
}

export function LiveThesesListPage() {
  useEffect(() => {
    document.title = "DEPTH4 · Theses";
  }, []);

  const requireFeature = useRequireFeature();
  const [activeFilter, setActiveFilter] = useState<"all" | "starred" | "ready">("all");
  const [assetClass, setAssetClass] = useState("All");
  const [sortBy, setSortBy] = useState("recent");
  const [showNewThesisModal, setShowNewThesisModal] = useState(false);
  const [newStatement, setNewStatement] = useState("");
  const [newAsset, setNewAsset] = useState("");
  const [newDirection, setNewDirection] = useState<"long" | "short">("long");
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const listKey = useMemo(() => {
    const params = new URLSearchParams();
    if (activeFilter === "starred") params.set("starred", "true");
    if (activeFilter === "ready") params.set("status", "Ready");
    if (assetClass !== "All") params.set("assetClass", assetClass);
    const sortMap: Record<string, string> = {
      recent: "recent",
      conviction: "conviction",
      mispricing: "mispricing",
    };
    params.set("sort", sortMap[sortBy] ?? "recent");
    const qs = params.toString();
    return `/api/theses${qs ? `?${qs}` : ""}`;
  }, [activeFilter, assetClass, sortBy]);

  const { data, error, isLoading, mutate } = useSWR<ThesisListResponse>(listKey, swrJsonFetcher);

  const starredCount = useMemo(() => {
    if (!data) return 0;
    const all = [...data.focus, ...data.monitor];
    return all.filter((t) => t.starred).length;
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

  const submitNewThesis = async () => {
    setCreateErr(null);
    setCreateBusy(true);
    try {
      const res = await authFetch("/api/theses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement: newStatement.trim(),
          asset: newAsset.trim(),
          direction: newDirection,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Create failed");
      }
      setShowNewThesisModal(false);
      setNewStatement("");
      setNewAsset("");
      setNewDirection("long");
      await mutate();
      toast.success("Thesis created");
    } catch (e: unknown) {
      setCreateErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreateBusy(false);
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
          <Skeleton className="h-2.5 w-16" />
          <div className="mt-3 space-y-0">
            <TableRowSkeleton />
            <TableRowSkeleton />
            <TableRowSkeleton />
          </div>
        </section>
        <section className="mt-10">
          <Skeleton className="h-2.5 w-20" />
          <div className="mt-3 space-y-0">
            <TableRowSkeleton />
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
          <p className="mt-1 text-[13px] text-zinc-400">Tracks macro events the market hasn&apos;t priced in yet.</p>
        </div>
        <button
          type="button"
          className="no-print inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 text-[12px] font-medium text-amber-400 transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]"
          onClick={() => requireFeature("createPrivateTheses", "new-thesis", () => setShowNewThesisModal(true))}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New thesis
        </button>
      </div>

      <div className="no-print mt-6 flex flex-wrap items-center justify-between gap-3">
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
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Sort</label>
            <select
              className="rounded-md border border-white/[0.08] bg-zinc-900/50 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-white/[0.12] focus:outline-none focus:ring-2 focus:ring-slate-400"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="recent">Most recent update</option>
              <option value="conviction">Highest probability</option>
              <option value="mispricing">Biggest mispricing</option>
            </select>
          </div>
        </div>
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Focus</p>
          <p className="text-[10px] text-zinc-600">Ready / Active</p>
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
            {data.focus.length === 0 ? (
              <p className="mt-4 text-[12px] text-zinc-600">No theses in this view.</p>
            ) : (
              data.focus.map((t) => (
                <ThesisRow key={t.slug} item={t} onToggleStar={() => void toggleStar(t.slug, t.starred)} />
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Monitor</p>
          <p className="text-[10px] text-zinc-600">Watching / Draft / next names</p>
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
            {data.monitor.length === 0 ? (
              <p className="mt-4 text-[12px] text-zinc-600">No monitor rows.</p>
            ) : (
              data.monitor.map((t) => (
                <ThesisRow key={t.slug} item={t} onToggleStar={() => void toggleStar(t.slug, t.starred)} />
              ))
            )}
          </div>
        </div>
      </section>

      {showNewThesisModal ? (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg border border-white/[0.06] bg-zinc-900 p-6">
            <h3 className="text-lg font-semibold text-zinc-100">New thesis</h3>
            <p className="mt-1 text-[12px] text-zinc-500">Creates a draft row via POST /api/theses — refine on the detail page.</p>
            {createErr ? <p className="mt-2 text-[12px] text-red-400">{createErr}</p> : null}
            <label className="mt-4 block text-[10px] uppercase tracking-[0.14em] text-zinc-500">Statement</label>
            <textarea
              value={newStatement}
              onChange={(e) => setNewStatement(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-md border border-white/[0.08] bg-zinc-900/50 px-3 py-2 text-[13px] text-zinc-100 transition-colors hover:border-white/[0.12] focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <label className="mt-3 block text-[10px] uppercase tracking-[0.14em] text-zinc-500">Asset</label>
            <input
              value={newAsset}
              onChange={(e) => setNewAsset(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/[0.08] bg-zinc-900/50 px-3 py-2 text-[13px] text-zinc-100 transition-colors hover:border-white/[0.12] focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="e.g. XAUUSD"
            />
            <label className="mt-3 block text-[10px] uppercase tracking-[0.14em] text-zinc-500">Direction</label>
            <select
              value={newDirection}
              onChange={(e) => setNewDirection(e.target.value as "long" | "short")}
              className="mt-1 w-full rounded-md border border-white/[0.08] bg-zinc-900/50 px-3 py-2 text-[13px] text-zinc-100 transition-colors hover:border-white/[0.12] focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="long">long</option>
              <option value="short">short</option>
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewThesisModal(false)}
                className="rounded-md bg-zinc-800 px-3 py-1.5 text-[12px] text-zinc-200 transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={createBusy || !newStatement.trim() || !newAsset.trim()}
                onClick={() => void submitNewThesis()}
                className="rounded-md bg-amber-500 px-3 py-1.5 text-[12px] font-medium text-zinc-950 transition-colors hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e] disabled:opacity-50"
              >
                {createBusy ? "Saving…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ThesisRow({ item, onToggleStar }: { item: ThesisListItem; onToggleStar: () => void }) {
  const lane = statusLane(item.status);
  return (
    <div className={cn(TABLE_GRID, "items-start border-b border-white/[0.06] py-4")}>
      <div>
        <p className="text-[10px] text-zinc-500">{item.asset}</p>
        <Link
          href={`/theses/${item.slug}`}
          className="mt-0.5 block text-[13px] font-medium text-zinc-100 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
        >
          {item.title}
        </Link>
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
        <p className="mt-1.5 max-w-lg text-[11px] leading-relaxed text-zinc-500">{item.whyNow}</p>
      </div>
      <ProbColumn mispricing={item.mispricingScore} item={item} />
      <div className="hidden sm:block">
        <span className={cn("inline-flex items-center gap-1 text-[10px] uppercase", getStatusTextColor(item.status))}>
          <span className={cn("h-1.5 w-1.5 rounded-full", getStatusDotColor(item.status))} />
          {item.status}
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
