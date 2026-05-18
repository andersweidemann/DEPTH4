import { getReaderAnalyticsOpsState } from "@/lib/thesis-engine-v2/thesis-reader-analytics/ops-state";
import {
  READER_ANALYTICS_RAW_RETENTION_DAYS,
  topSourcesFromCounts,
} from "@/lib/thesis-engine-v2/thesis-reader-analytics/retention";
import type { ReaderAnalyticsSort, ThesisReaderAnalyticsRow } from "@/lib/thesis-engine-v2/thesis-reader-analytics/report-query";
import {
  filterReaderAnalyticsTheses,
  sortReaderAnalyticsTheses,
} from "@/lib/thesis-engine-v2/thesis-reader-analytics/report-query";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export type { ThesisReaderAnalyticsRow, ReaderAnalyticsSort } from "@/lib/thesis-engine-v2/thesis-reader-analytics/report-query";

export type ThesisReaderDailyRollup = {
  date: string;
  humanViews: number;
  humanUniqueVisitors: number;
  crawlerViews: number;
  previewViews: number;
};

export type ReaderAnalyticsHealth = {
  writeFailures: number;
  lastFailureAt: string | null;
  lastFailureMessage: string | null;
  lastSuccessAt: string | null;
  serviceRoleConfigured: boolean;
  status: "ok" | "degraded" | "no_data";
  hint: string;
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

type DailyRow = {
  thesis_id: string;
  slug: string;
  view_date: string;
  human_views: number;
  human_unique_visitors: number;
  crawler_views: number;
  preview_views: number;
  source_counts: Record<string, number> | null;
  updated_at?: string;
};

function mergeSourceCounts(into: Map<string, number>, counts: Record<string, number> | null | undefined): void {
  if (!counts) return;
  for (const [k, v] of Object.entries(counts)) {
    into.set(k, (into.get(k) ?? 0) + (typeof v === "number" ? v : 0));
  }
}

function accumulateThesisMetrics(
  byThesis: Map<
    string,
    {
      slug: string;
      humanViews: number;
      humanUniqueEstimate: number;
      crawlerViews: number;
      previewViews: number;
      lastViewedAt: string | null;
      sourceCounts: Map<string, number>;
    }
  >,
  thesisId: string,
  slug: string,
  patch: {
    humanViews?: number;
    humanUnique?: number;
    crawlerViews?: number;
    previewViews?: number;
    lastViewedAt?: string | null;
    sourceCounts?: Record<string, number> | null;
  },
): void {
  const cur = byThesis.get(thesisId) ?? {
    slug,
    humanViews: 0,
    humanUniqueEstimate: 0,
    crawlerViews: 0,
    previewViews: 0,
    lastViewedAt: null,
    sourceCounts: new Map<string, number>(),
  };
  cur.slug = slug || cur.slug;
  cur.humanViews += patch.humanViews ?? 0;
  cur.humanUniqueEstimate += patch.humanUnique ?? 0;
  cur.crawlerViews += patch.crawlerViews ?? 0;
  cur.previewViews += patch.previewViews ?? 0;
  if (patch.lastViewedAt) {
    if (!cur.lastViewedAt || patch.lastViewedAt > cur.lastViewedAt) {
      cur.lastViewedAt = patch.lastViewedAt;
    }
  }
  mergeSourceCounts(cur.sourceCounts, patch.sourceCounts);
  byThesis.set(thesisId, cur);
}

function buildAnalyticsHealth(
  writeFailures: number,
  lastFailureAt: string | null,
  eventCount: number,
  serviceRoleConfigured: boolean,
): ReaderAnalyticsHealth {
  const ops = getReaderAnalyticsOpsState();
  let status: ReaderAnalyticsHealth["status"] = "ok";
  let hint = "Beacon + server paths are operating normally in this runtime.";

  if (!serviceRoleConfigured) {
    status = "degraded";
    hint = "SUPABASE_SERVICE_ROLE_KEY missing — views will not persist.";
  } else if (writeFailures > 0) {
    status = "degraded";
    hint = "Recent analytics write failures — check Vercel logs for [DEPTH4] reader analytics.";
  } else if (eventCount === 0 && lastFailureAt) {
    status = "degraded";
    hint = "No events in window but failures were recorded — inserts may be failing.";
  } else if (eventCount === 0) {
    status = "no_data";
    hint = "No public reader views in this window yet (not an error).";
  }

  return {
    writeFailures,
    lastFailureAt: lastFailureAt ?? ops.lastFailureAt,
    lastFailureMessage: ops.lastFailureMessage,
    lastSuccessAt: ops.lastSuccessAt,
    serviceRoleConfigured,
    status,
    hint,
  };
}

export async function fetchReaderAnalyticsReport(options: {
  days?: number;
  sort?: ReaderAnalyticsSort;
  q?: string;
} = {}): Promise<{
  since: string;
  sinceDate: string;
  theses: ThesisReaderAnalyticsRow[];
  writeFailures: number;
  health: ReaderAnalyticsHealth;
  retention: { rawRetentionDays: number; policy: string };
}> {
  const days = Math.min(90, Math.max(1, options.days ?? 30));
  const sort = options.sort ?? "humanViews";
  const q = options.q ?? "";

  const svc = createServiceRoleClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
  const sinceDate = since.slice(0, 10);

  if (!svc) {
    const ops = getReaderAnalyticsOpsState();
    return {
      since,
      sinceDate,
      theses: [],
      writeFailures: ops.writeFailures,
      health: buildAnalyticsHealth(ops.writeFailures, ops.lastFailureAt, 0, false),
      retention: {
        rawRetentionDays: READER_ANALYTICS_RAW_RETENTION_DAYS,
        policy: `Raw events kept ${READER_ANALYTICS_RAW_RETENTION_DAYS} days; older rolled to daily aggregates.`,
      },
    };
  }

  const { data: events, error } = await svc
    .from("thesis_reader_public_views")
    .select("thesis_id, slug, viewed_at, view_date, visitor_key, visitor_kind, source_bucket")
    .gte("viewed_at", since)
    .order("viewed_at", { ascending: false })
    .limit(50_000);

  if (error) {
    console.error("[DEPTH4] reader analytics report fetch failed", error.message);
    const ops = getReaderAnalyticsOpsState();
    return {
      since,
      sinceDate,
      theses: [],
      writeFailures: ops.writeFailures,
      health: buildAnalyticsHealth(ops.writeFailures, ops.lastFailureAt, 0, true),
      retention: {
        rawRetentionDays: READER_ANALYTICS_RAW_RETENTION_DAYS,
        policy: `Raw events kept ${READER_ANALYTICS_RAW_RETENTION_DAYS} days; older rolled to daily aggregates.`,
      },
    };
  }

  const { data: dailyRows, error: dailyErr } = await svc
    .from("thesis_reader_public_views_daily")
    .select(
      "thesis_id, slug, view_date, human_views, human_unique_visitors, crawler_views, preview_views, source_counts, updated_at",
    )
    .gte("view_date", sinceDate);

  if (dailyErr) {
    console.error("[DEPTH4] reader analytics daily fetch failed", dailyErr.message);
  }

  const rows = (events ?? []) as ViewEvent[];
  const rawDatesByThesis = new Map<string, Set<string>>();
  const humanKeysByThesis = new Map<string, Set<string>>();
  const byThesis = new Map<
    string,
    {
      slug: string;
      humanViews: number;
      humanUniqueEstimate: number;
      crawlerViews: number;
      previewViews: number;
      lastViewedAt: string | null;
      sourceCounts: Map<string, number>;
    }
  >();

  for (const e of rows) {
    const dates = rawDatesByThesis.get(e.thesis_id) ?? new Set<string>();
    dates.add(e.view_date);
    rawDatesByThesis.set(e.thesis_id, dates);

    const human = e.visitor_kind === "human";
    const crawler = e.visitor_kind === "crawler";
    const preview = e.visitor_kind === "preview";
    const sourcePatch =
      human && e.source_bucket
        ? ({ [e.source_bucket]: 1 } as Record<string, number>)
        : null;

    if (human) {
      const keys = humanKeysByThesis.get(e.thesis_id) ?? new Set();
      keys.add(e.visitor_key);
      humanKeysByThesis.set(e.thesis_id, keys);
    }

    accumulateThesisMetrics(byThesis, e.thesis_id, e.slug, {
      humanViews: human ? 1 : 0,
      humanUnique: 0,
      crawlerViews: crawler ? 1 : 0,
      previewViews: preview ? 1 : 0,
      lastViewedAt: e.viewed_at,
      sourceCounts: sourcePatch,
    });
  }

  for (const [thesisId, keys] of Array.from(humanKeysByThesis.entries())) {
    const cur = byThesis.get(thesisId);
    if (cur) cur.humanUniqueEstimate = keys.size;
  }

  for (const d of (dailyRows ?? []) as DailyRow[]) {
    if (rawDatesByThesis.get(d.thesis_id)?.has(d.view_date)) continue;

    accumulateThesisMetrics(byThesis, d.thesis_id, d.slug, {
      humanViews: d.human_views,
      humanUnique: d.human_unique_visitors,
      crawlerViews: d.crawler_views,
      previewViews: d.preview_views,
      lastViewedAt: d.updated_at ?? `${d.view_date}T23:59:59.000Z`,
      sourceCounts: d.source_counts,
    });

    const cur = byThesis.get(d.thesis_id);
    if (cur) {
      cur.humanUniqueEstimate += d.human_unique_visitors;
    }
  }

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

  let theses: ThesisReaderAnalyticsRow[] = [];
  for (const [thesisId, m] of Array.from(byThesis.entries())) {
    const meta = metaById.get(thesisId);
    theses.push({
      thesisId,
      slug: meta?.slug ?? m.slug ?? thesisId,
      title: meta?.title ?? null,
      readerPublicEnabled: meta?.readerPublicEnabled ?? false,
      humanViews: m.humanViews,
      humanUniqueVisitors: m.humanUniqueEstimate,
      crawlerViews: m.crawlerViews,
      previewViews: m.previewViews,
      lastViewedAt: m.lastViewedAt,
      topSources: topSourcesFromCounts(Object.fromEntries(m.sourceCounts.entries()), 5),
    });
  }

  theses = sortReaderAnalyticsTheses(filterReaderAnalyticsTheses(theses, q), sort);

  const ops = getReaderAnalyticsOpsState();
  const eventCount = rows.length + (dailyRows?.length ?? 0);

  return {
    since,
    sinceDate,
    theses,
    writeFailures: ops.writeFailures,
    health: buildAnalyticsHealth(ops.writeFailures, ops.lastFailureAt, eventCount, true),
    retention: {
      rawRetentionDays: READER_ANALYTICS_RAW_RETENTION_DAYS,
      policy: `Raw events kept ${READER_ANALYTICS_RAW_RETENTION_DAYS} days; older rolled to daily aggregates.`,
    },
  };
}

export async function fetchReaderAnalyticsDaily(
  slug: string,
  days = 30,
): Promise<ThesisReaderDailyRollup[]> {
  const svc = createServiceRoleClient();
  if (!svc) return [];

  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString().slice(0, 10);
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();

  const byDate = new Map<string, ThesisReaderDailyRollup & { humanKeys: Set<string> }>();

  const { data: raw, error: rawErr } = await svc
    .from("thesis_reader_public_views")
    .select("view_date, visitor_key, visitor_kind")
    .eq("slug", slug)
    .gte("viewed_at", sinceIso);

  if (!rawErr && raw) {
    for (const row of raw as { view_date: string; visitor_key: string; visitor_kind: string }[]) {
      const d = row.view_date;
      const bucket =
        byDate.get(d) ??
        ({
          date: d,
          humanViews: 0,
          humanUniqueVisitors: 0,
          crawlerViews: 0,
          previewViews: 0,
          humanKeys: new Set<string>(),
        } as ThesisReaderDailyRollup & { humanKeys: Set<string> });
      if (row.visitor_kind === "human") {
        bucket.humanViews += 1;
        bucket.humanKeys.add(row.visitor_key);
      } else if (row.visitor_kind === "crawler") {
        bucket.crawlerViews += 1;
      } else if (row.visitor_kind === "preview") {
        bucket.previewViews += 1;
      }
      byDate.set(d, bucket);
    }
  }

  const { data: daily, error: dailyErr } = await svc
    .from("thesis_reader_public_views_daily")
    .select("view_date, human_views, human_unique_visitors, crawler_views, preview_views")
    .eq("slug", slug)
    .gte("view_date", sinceDate);

  if (!dailyErr && daily) {
    for (const row of daily as {
      view_date: string;
      human_views: number;
      human_unique_visitors: number;
      crawler_views: number;
      preview_views: number;
    }[]) {
      const d = row.view_date;
      const bucket =
        byDate.get(d) ??
        ({
          date: d,
          humanViews: 0,
          humanUniqueVisitors: 0,
          crawlerViews: 0,
          previewViews: 0,
          humanKeys: new Set<string>(),
        } as ThesisReaderDailyRollup & { humanKeys: Set<string> });
      bucket.humanViews += row.human_views;
      bucket.crawlerViews += row.crawler_views;
      bucket.previewViews += row.preview_views;
      bucket.humanUniqueVisitors = Math.max(bucket.humanUniqueVisitors, row.human_unique_visitors);
      byDate.set(d, bucket);
    }
  }

  return Array.from(byDate.values())
    .map(({ humanKeys, ...rest }) => ({
      ...rest,
      humanUniqueVisitors: Math.max(rest.humanUniqueVisitors, humanKeys.size),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
