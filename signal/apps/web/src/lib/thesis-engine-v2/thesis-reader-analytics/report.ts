import { getReaderAnalyticsWriteFailureCount } from "@/lib/thesis-engine-v2/thesis-reader-analytics/record";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";
import type { ReaderSourceBucket } from "@/lib/thesis-engine-v2/thesis-reader-analytics/classify";

export type ThesisReaderAnalyticsRow = {
  thesisId: string;
  slug: string;
  title: string | null;
  readerPublicEnabled: boolean;
  humanViews: number;
  humanUniqueVisitors: number;
  crawlerViews: number;
  previewViews: number;
  lastViewedAt: string | null;
  topSources: { bucket: ReaderSourceBucket | string; count: number }[];
};

export type ThesisReaderDailyRollup = {
  date: string;
  humanViews: number;
  humanUniqueVisitors: number;
  crawlerViews: number;
};

type ViewEvent = {
  thesis_id: string;
  slug: string;
  viewed_at: string;
  view_date: string;
  visitor_key: string;
  visitor_kind: string;
  source_bucket: string;
};

export async function fetchReaderAnalyticsReport(days = 30): Promise<{
  since: string;
  theses: ThesisReaderAnalyticsRow[];
  writeFailures: number;
}> {
  const svc = createServiceRoleClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
  if (!svc) {
    return { since, theses: [], writeFailures: 0 };
  }

  const { data: events, error } = await svc
    .from("thesis_reader_public_views")
    .select("thesis_id, slug, viewed_at, view_date, visitor_key, visitor_kind, source_bucket")
    .gte("viewed_at", since)
    .order("viewed_at", { ascending: false })
    .limit(50_000);

  if (error) {
    console.error("[DEPTH4] reader analytics report fetch failed", error.message);
    return { since, theses: [], writeFailures: 0 };
  }

  const rows = (events ?? []) as ViewEvent[];
  const { data: thesisMeta } = await svc
    .from("theses")
    .select("id, slug, title, reader_public_enabled")
    .not("slug", "is", null);

  const metaById = new Map<string, { slug: string; title: string | null; readerPublicEnabled: boolean }>();
  for (const t of thesisMeta ?? []) {
    const o = t as { id?: string; slug?: string; title?: string; reader_public_enabled?: boolean };
    if (typeof o.id === "string" && typeof o.slug === "string") {
      metaById.set(o.id, {
        slug: o.slug,
        title: typeof o.title === "string" ? o.title : null,
        readerPublicEnabled: o.reader_public_enabled === true,
      });
    }
  }

  const byThesis = new Map<string, ViewEvent[]>();
  for (const e of rows) {
    const list = byThesis.get(e.thesis_id) ?? [];
    list.push(e);
    byThesis.set(e.thesis_id, list);
  }

  const theses: ThesisReaderAnalyticsRow[] = [];
  for (const [thesisId, list] of byThesis) {
    const meta = metaById.get(thesisId);
    const slug = meta?.slug ?? list[0]?.slug ?? thesisId;
    const human = list.filter((e) => e.visitor_kind === "human");
    const crawlers = list.filter((e) => e.visitor_kind === "crawler");
    const previews = list.filter((e) => e.visitor_kind === "preview");

    const sourceCounts = new Map<string, number>();
    for (const e of human) {
      sourceCounts.set(e.source_bucket, (sourceCounts.get(e.source_bucket) ?? 0) + 1);
    }
    const topSources = [...sourceCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([bucket, count]) => ({ bucket, count }));

    theses.push({
      thesisId,
      slug,
      title: meta?.title ?? null,
      readerPublicEnabled: meta?.readerPublicEnabled ?? false,
      humanViews: human.length,
      humanUniqueVisitors: new Set(human.map((e) => e.visitor_key)).size,
      crawlerViews: crawlers.length,
      previewViews: previews.length,
      lastViewedAt: list[0]?.viewed_at ?? null,
      topSources,
    });
  }

  theses.sort((a, b) => b.humanViews - a.humanViews);

  return { since, theses, writeFailures: getReaderAnalyticsWriteFailureCount() };
}

export async function fetchReaderAnalyticsDaily(
  slug: string,
  days = 30,
): Promise<ThesisReaderDailyRollup[]> {
  const svc = createServiceRoleClient();
  if (!svc) return [];

  const since = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString().slice(0, 10);

  const { data, error } = await svc
    .from("thesis_reader_public_views")
    .select("view_date, visitor_key, visitor_kind")
    .eq("slug", slug)
    .gte("view_date", since);

  if (error || !data) return [];

  const byDate = new Map<string, { human: ViewEvent[]; crawler: number }>();
  for (const row of data as { view_date: string; visitor_key: string; visitor_kind: string }[]) {
    const d = row.view_date;
    const bucket = byDate.get(d) ?? { human: [], crawler: 0 };
    if (row.visitor_kind === "human") {
      bucket.human.push(row as ViewEvent);
    } else if (row.visitor_kind === "crawler") {
      bucket.crawler += 1;
    }
    byDate.set(d, bucket);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      humanViews: v.human.length,
      humanUniqueVisitors: new Set(v.human.map((e) => e.visitor_key)).size,
      crawlerViews: v.crawler,
    }));
}
