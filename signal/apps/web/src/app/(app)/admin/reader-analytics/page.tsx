"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

type ApiOk = {
  ok: true;
  since: string;
  days: number;
  writeFailures: number;
  theses: ThesisRow[];
};

export default function ReaderAnalyticsAdminPage() {
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiOk | null>(null);

  useEffect(() => {
    void authFetch("/api/admin/thesis-reader-analytics?days=30")
      .then(async (res) => {
        if (res.status === 403) {
          setDenied(true);
          return;
        }
        const j = (await res.json()) as ApiOk;
        if (j.ok) setData(j);
      })
      .finally(() => setLoading(false));
  }, []);

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
        views require a client beacon; crawlers/previews are tracked separately.
      </p>

      {loading ? <p className="mt-8 text-sm text-zinc-600">Loading…</p> : null}

      {data ? (
        <>
          <p className="mt-6 text-[11px] text-zinc-600">
            Since {new Date(data.since).toLocaleString()} · {data.days}d window
            {data.writeFailures > 0 ? ` · ${data.writeFailures} write failure(s) logged` : ""}
          </p>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="py-2 pr-4">Thesis</th>
                  <th className="py-2 pr-4">Public</th>
                  <th className="py-2 pr-4">Human views</th>
                  <th className="py-2 pr-4">Unique</th>
                  <th className="py-2 pr-4">Crawler</th>
                  <th className="py-2 pr-4">Preview</th>
                  <th className="py-2 pr-4">Last viewed</th>
                  <th className="py-2">Top source</th>
                </tr>
              </thead>
              <tbody>
                {data.theses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-zinc-600">
                      No public reader views in this window.
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
                      <td className="py-3 text-zinc-500">{t.topSources[0]?.bucket ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
