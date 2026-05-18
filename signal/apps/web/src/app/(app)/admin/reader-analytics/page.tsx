"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/api";

type ThesisRow = {
  thesisId: string;
  slug: string;
  title: string | null;
  readerPublicEnabled: boolean;
  humanViews: number;
  humanUniqueVisitors: number;
  crawlerViews: number;
  previewViews: number;
  lastViewedAt: string | null;
  topSources: { bucket: string; count: number }[];
};

type DailyRow = {
  date: string;
  humanViews: number;
  humanUniqueVisitors: number;
  crawlerViews: number;
  previewViews: number;
};

type ReaderAnalyticsSort = "humanViews" | "lastViewed" | "recent";

type ApiOk = {
  ok: true;
  since: string;
  days: number;
  sort: ReaderAnalyticsSort;
  q: string;
  writeFailures: number;
  health: {
    status: "ok" | "degraded" | "no_data";
    hint: string;
    writeFailures: number;
    lastFailureAt: string | null;
    lastFailureMessage: string | null;
    lastSuccessAt: string | null;
    serviceRoleConfigured: boolean;
  };
  retention: { rawRetentionDays: number; policy: string };
  theses: ThesisRow[];
  daily: DailyRow[];
};

function formatSources(topSources: ThesisRow["topSources"]): string {
  if (!topSources.length) return "—";
  return topSources.map((s) => `${s.bucket} (${s.count})`).join(", ");
}

export default function ReaderAnalyticsAdminPage() {
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiOk | null>(null);
  const [days, setDays] = useState(7);
  const [sort, setSort] = useState<ReaderAnalyticsSort>("recent");
  const [q, setQ] = useState("");
  const [selectedSlug, setSelectedSlug] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      days: String(days),
      sort,
      q: q.trim(),
    });
    if (selectedSlug) params.set("slug", selectedSlug);

    void authFetch(`/api/admin/thesis-reader-analytics?${params.toString()}`)
      .then(async (res) => {
        if (res.status === 403) {
          setDenied(true);
          return;
        }
        const j = (await res.json()) as ApiOk;
        if (j.ok) setData(j);
      })
      .finally(() => setLoading(false));
  }, [days, sort, q, selectedSlug]);

  useEffect(() => {
    load();
  }, [load]);

  const healthClass = useMemo(() => {
    if (!data) return "text-zinc-500";
    if (data.health.status === "degraded") return "text-[#E8473F]";
    if (data.health.status === "no_data") return "text-zinc-500";
    return "text-emerald-500/90";
  }, [data]);

  if (denied) {
    return (
      <div className="py-16 text-center text-sm text-zinc-500">
        Elevated access required.{" "}
        <Link href="/theses" className="text-[#E8473F] hover:underline">
          Back to theses
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <Link href="/admin/thesis-live" className="text-[11px] text-zinc-500 hover:text-zinc-300">
        ← Admin
      </Link>
      <h1 className="mt-4 text-xl font-semibold text-zinc-50">Public reader analytics</h1>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-zinc-500">
        First-party opens on <span className="font-mono text-zinc-400">/theses/&lt;slug&gt;/read</span>. Human
        views use the client beacon; crawlers and link previews are separate.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-[11px] text-zinc-500">
          Window
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="mt-1 block rounded border border-white/[0.08] bg-[#1a1a19] px-2 py-1.5 text-[12px] text-zinc-200"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
        <label className="text-[11px] text-zinc-500">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as ReaderAnalyticsSort)}
            className="mt-1 block rounded border border-white/[0.08] bg-[#1a1a19] px-2 py-1.5 text-[12px] text-zinc-200"
          >
            <option value="recent">Recent activity</option>
            <option value="humanViews">Human views</option>
            <option value="lastViewed">Last viewed</option>
          </select>
        </label>
        <label className="min-w-[12rem] flex-1 text-[11px] text-zinc-500">
          Search slug / title
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. strait-hormuz"
            className="mt-1 w-full rounded border border-white/[0.08] bg-[#1a1a19] px-2 py-1.5 text-[12px] text-zinc-200"
          />
        </label>
        <label className="min-w-[12rem] flex-1 text-[11px] text-zinc-500">
          Daily detail slug
          <select
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            className="mt-1 w-full rounded border border-white/[0.08] bg-[#1a1a19] px-2 py-1.5 text-[12px] text-zinc-200"
          >
            <option value="">—</option>
            {(data?.theses ?? []).map((t) => (
              <option key={t.thesisId} value={t.slug}>
                {t.slug}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={load}
          className="rounded border border-white/[0.1] px-3 py-1.5 text-[12px] text-zinc-300 hover:border-[#E8473F]/40"
        >
          Refresh
        </button>
      </div>

      {loading ? <p className="mt-8 text-sm text-zinc-600">Loading…</p> : null}

      {data ? (
        <>
          <p className={`mt-6 text-[12px] ${healthClass}`}>
            {data.health.status.toUpperCase()}: {data.health.hint}
            {data.health.lastFailureAt
              ? ` · Last failure ${new Date(data.health.lastFailureAt).toLocaleString()}`
              : ""}
            {data.health.lastSuccessAt
              ? ` · Last write ${new Date(data.health.lastSuccessAt).toLocaleString()}`
              : ""}
          </p>
          <p className="mt-2 text-[11px] text-zinc-600">
            Since {new Date(data.since).toLocaleString()} · {data.days}d · Retention: raw{" "}
            {data.retention.rawRetentionDays}d ({data.retention.policy})
            {data.writeFailures > 0 ? ` · ${data.writeFailures} failure(s) this runtime` : ""}
          </p>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="py-2 pr-4">Thesis</th>
                  <th className="py-2 pr-4">Public</th>
                  <th className="py-2 pr-4">Human</th>
                  <th className="py-2 pr-4">Unique</th>
                  <th className="py-2 pr-4">Crawler</th>
                  <th className="py-2 pr-4">Preview</th>
                  <th className="py-2 pr-4">Last viewed</th>
                  <th className="py-2">Sources</th>
                </tr>
              </thead>
              <tbody>
                {data.theses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-zinc-600">
                      {data.health.status === "degraded"
                        ? "No rows loaded — analytics may be failing (check health above)."
                        : "No public reader views in this window."}
                    </td>
                  </tr>
                ) : (
                  data.theses.map((t) => (
                    <tr key={t.thesisId} className="border-b border-white/[0.04]">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/theses/${encodeURIComponent(t.slug)}/read`}
                          className="font-medium text-zinc-200 hover:text-[#E8473F]"
                        >
                          {t.title ?? t.slug}
                        </Link>
                        <p className="font-mono text-[10px] text-zinc-600">{t.slug}</p>
                      </td>
                      <td className="py-3 pr-4 text-zinc-400">{t.readerPublicEnabled ? "yes" : "no"}</td>
                      <td className="py-3 pr-4 tabular-nums text-zinc-200">{t.humanViews}</td>
                      <td className="py-3 pr-4 tabular-nums text-zinc-400">{t.humanUniqueVisitors}</td>
                      <td className="py-3 pr-4 tabular-nums text-zinc-500">{t.crawlerViews}</td>
                      <td className="py-3 pr-4 tabular-nums text-zinc-500">{t.previewViews}</td>
                      <td className="py-3 pr-4 text-zinc-500">
                        {t.lastViewedAt ? new Date(t.lastViewedAt).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 text-zinc-500">{formatSources(t.topSources)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {selectedSlug && data.daily.length > 0 ? (
            <div className="mt-10">
              <h2 className="text-sm font-medium text-zinc-300">
                Daily rollup — <span className="font-mono text-zinc-500">{selectedSlug}</span>
              </h2>
              <table className="mt-4 w-full max-w-lg border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[10px] uppercase text-zinc-500">
                    <th className="py-2">Date</th>
                    <th className="py-2">Human</th>
                    <th className="py-2">Unique</th>
                    <th className="py-2">Crawler</th>
                    <th className="py-2">Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((d) => (
                    <tr key={d.date} className="border-b border-white/[0.04]">
                      <td className="py-2 text-zinc-400">{d.date}</td>
                      <td className="py-2 tabular-nums">{d.humanViews}</td>
                      <td className="py-2 tabular-nums text-zinc-500">{d.humanUniqueVisitors}</td>
                      <td className="py-2 tabular-nums text-zinc-500">{d.crawlerViews}</td>
                      <td className="py-2 tabular-nums text-zinc-500">{d.previewViews}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
