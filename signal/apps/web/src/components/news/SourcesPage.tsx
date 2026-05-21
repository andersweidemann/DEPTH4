"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { ClientSectionErrorBoundary } from "@/components/shared/ClientSectionErrorBoundary";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeaderSkeleton, Skeleton } from "@/components/shared/Skeleton";
import { cn } from "@/lib/utils";

const FETCH_TIMEOUT_MS = 20_000;

type SourceRow = {
  id: string;
  name: string;
  feedUrl: string;
  lastFetchedAt: string | null;
  headlines24h: number;
  status: "active" | "idle" | "error";
  kind?: "rss" | "proprietary";
  scheduleLabel?: string;
};

function statusLabel(status: SourceRow["status"]): string {
  if (status === "active") return "Active";
  if (status === "idle") return "Idle";
  return "No data";
}

function formatFetched(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SourcesLoading() {
  return (
    <div className="pb-16">
      <PageHeaderSkeleton />
      <div className="mt-6 space-y-2">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}

function SourcesContent() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "DEPTH4 · Sources";
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/news/sources", { credentials: "include", signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as { sources?: SourceRow[]; error?: string };
        if (j.error) throw new Error(j.error);
        if (!cancelled) setSources(j.sources ?? []);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "AbortError") {
          setError("Request timed out — try again.");
        } else {
          setError(e instanceof Error ? e.message : "Failed to load sources");
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (loading) return <SourcesLoading />;

  if (error) {
    return <ErrorBanner message={error} onRetry={() => window.location.reload()} />;
  }

  const proprietary = sources.filter((s) => s.kind === "proprietary");
  const rssSources = sources.filter((s) => s.kind !== "proprietary");

  return (
    <div className="pb-16">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">News sources</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-zinc-400">
          Tier-1–2 feeds DEPTH4 ingests for macro reasoning. Headlines are analyzed before they surface as thesis
          candidates — not republished as a news dashboard.
        </p>
        <p className="mt-3 flex flex-wrap gap-3 text-[11px]">
          <Link href="/feed" className="text-zinc-500 hover:text-zinc-300">
            ← Feed
          </Link>
          <Link href="/submit-news" className="font-medium text-[#E8473F] hover:underline">
            Submit a headline →
          </Link>
        </p>
      </div>

      {proprietary.length > 0 ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {proprietary.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-white/[0.08] bg-[#111110] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[13px] font-semibold text-zinc-100">{s.name}</h2>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                    Proprietary technical arrays, ECM turn dates, and capital-flow indicators — ingested as
                    evidence, not republished headlines.
                  </p>
                </div>
                {s.scheduleLabel ? (
                  <span className="shrink-0 rounded bg-[#E8473F]/15 px-2 py-0.5 text-[10px] font-medium text-[#E8473F]">
                    {s.scheduleLabel}
                  </span>
                ) : null}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <dt className="text-zinc-600">Last fetch</dt>
                  <dd className="mt-0.5 text-zinc-400">{formatFetched(s.lastFetchedAt)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-600">24h signals</dt>
                  <dd className="mt-0.5 tabular-nums text-zinc-400">{s.headlines24h}</dd>
                </div>
              </dl>
              <a
                href={s.feedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-[10px] text-zinc-600 hover:text-[#E8473F]"
              >
                {s.feedUrl}
              </a>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-8 overflow-hidden rounded-lg border border-white/[0.08]">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">24h headlines</th>
              <th className="px-3 py-2">Last fetch</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rssSources.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                  No RSS sources configured yet.
                </td>
              </tr>
            ) : (
              rssSources.map((s) => (
                <tr key={s.id} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-zinc-200">{s.name}</p>
                    <a
                      href={s.feedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 block max-w-xs truncate text-[10px] text-zinc-600 hover:text-zinc-400"
                    >
                      {s.feedUrl}
                    </a>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-zinc-400">{s.headlines24h}</td>
                  <td className="px-3 py-2.5 text-zinc-500">{formatFetched(s.lastFetchedAt)}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium",
                        s.status === "active" && "bg-emerald-500/10 text-emerald-400",
                        s.status === "idle" && "bg-zinc-500/10 text-zinc-400",
                        s.status === "error" && "bg-red-500/10 text-red-400",
                      )}
                    >
                      {statusLabel(s.status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-[11px] text-zinc-600">
        User submissions are queued separately and run through the same evidence cascade as ingested headlines.
      </p>
    </div>
  );
}

export function SourcesPage() {
  return (
    <ClientSectionErrorBoundary label="sources">
      <Suspense fallback={<SourcesLoading />}>
        <SourcesContent />
      </Suspense>
    </ClientSectionErrorBoundary>
  );
}
