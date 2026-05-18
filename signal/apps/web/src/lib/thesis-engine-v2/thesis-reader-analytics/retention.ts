/**
 * Phase 4D.1 — public reader analytics retention.
 *
 * Policy: keep raw events in `thesis_reader_public_views` for 180 UTC days, then roll up
 * into `thesis_reader_public_views_daily` and delete the raw rows.
 *
 * Why 180 days: ~6 months is enough for share-traction product learning while avoiding
 * indefinite per-open hoarding; aligns with privacy-first, minimal retention.
 *
 * Enforcement: `GET|POST /api/cron/reader-analytics-retention` (Vercel cron or external scheduler).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReaderSourceBucket } from "@/lib/thesis-engine-v2/thesis-reader-analytics/classify";

/** Raw event retention window (days). Override in tests via options only. */
export const READER_ANALYTICS_RAW_RETENTION_DAYS = 180;

export type RawViewForRetention = {
  thesis_id: string;
  slug: string;
  view_date: string;
  visitor_key: string;
  visitor_kind: string;
  source_bucket: string;
  viewed_at: string;
};

export type DailyAggregateUpsert = {
  thesis_id: string;
  slug: string;
  view_date: string;
  human_views: number;
  human_unique_visitors: number;
  crawler_views: number;
  preview_views: number;
  source_counts: Record<string, number>;
};

export function readerAnalyticsRetentionCutoffIso(
  now: Date,
  retentionDays = READER_ANALYTICS_RAW_RETENTION_DAYS,
): string {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() - retentionDays);
  return d.toISOString();
}

/** Build per-thesis/per-day aggregates from raw rows slated for deletion. */
export function buildDailyAggregatesFromRawEvents(rows: RawViewForRetention[]): DailyAggregateUpsert[] {
  const byKey = new Map<
    string,
    {
      thesis_id: string;
      slug: string;
      view_date: string;
      humanKeys: Set<string>;
      human_views: number;
      crawler_views: number;
      preview_views: number;
      source_counts: Map<string, number>;
    }
  >();

  for (const row of rows) {
    const key = `${row.thesis_id}:${row.view_date}`;
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = {
        thesis_id: row.thesis_id,
        slug: row.slug,
        view_date: row.view_date,
        humanKeys: new Set(),
        human_views: 0,
        crawler_views: 0,
        preview_views: 0,
        source_counts: new Map(),
      };
      byKey.set(key, bucket);
    }

    if (row.visitor_kind === "human") {
      bucket.human_views += 1;
      bucket.humanKeys.add(row.visitor_key);
      const src = row.source_bucket || "unknown";
      bucket.source_counts.set(src, (bucket.source_counts.get(src) ?? 0) + 1);
    } else if (row.visitor_kind === "crawler") {
      bucket.crawler_views += 1;
    } else if (row.visitor_kind === "preview") {
      bucket.preview_views += 1;
    }
  }

  return Array.from(byKey.values()).map((b) => ({
    thesis_id: b.thesis_id,
    slug: b.slug,
    view_date: b.view_date,
    human_views: b.human_views,
    human_unique_visitors: b.humanKeys.size,
    crawler_views: b.crawler_views,
    preview_views: b.preview_views,
    source_counts: Object.fromEntries(b.source_counts.entries()),
  }));
}

export type ReaderAnalyticsRetentionResult = {
  ok: boolean;
  retentionDays: number;
  cutoffIso: string;
  rawScanned: number;
  dailyUpserted: number;
  rawDeleted: number;
  error?: string;
};

async function fetchRawOlderThan(
  svc: SupabaseClient,
  cutoffIso: string,
  batchSize: number,
): Promise<RawViewForRetention[]> {
  const all: RawViewForRetention[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await svc
      .from("thesis_reader_public_views")
      .select("thesis_id, slug, view_date, visitor_key, visitor_kind, source_bucket, viewed_at")
      .lt("viewed_at", cutoffIso)
      .order("viewed_at", { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) throw new Error(error.message);
    const batch = (data ?? []) as RawViewForRetention[];
    all.push(...batch);
    if (batch.length < batchSize) break;
    offset += batchSize;
  }
  return all;
}

async function mergeDailyAggregates(svc: SupabaseClient, aggregates: DailyAggregateUpsert[]): Promise<number> {
  let upserted = 0;
  for (const agg of aggregates) {
    const { data: existing, error: readErr } = await svc
      .from("thesis_reader_public_views_daily")
      .select(
        "human_views, human_unique_visitors, crawler_views, preview_views, source_counts",
      )
      .eq("thesis_id", agg.thesis_id)
      .eq("view_date", agg.view_date)
      .maybeSingle();

    if (readErr) throw new Error(readErr.message);

    const prev = existing as {
      human_views?: number;
      human_unique_visitors?: number;
      crawler_views?: number;
      preview_views?: number;
      source_counts?: Record<string, number>;
    } | null;

    const mergedSources: Record<string, number> = { ...(prev?.source_counts ?? {}) };
    for (const [k, v] of Object.entries(agg.source_counts)) {
      mergedSources[k] = (mergedSources[k] ?? 0) + v;
    }

    const row = {
      thesis_id: agg.thesis_id,
      slug: agg.slug,
      view_date: agg.view_date,
      human_views: (prev?.human_views ?? 0) + agg.human_views,
      human_unique_visitors: (prev?.human_unique_visitors ?? 0) + agg.human_unique_visitors,
      crawler_views: (prev?.crawler_views ?? 0) + agg.crawler_views,
      preview_views: (prev?.preview_views ?? 0) + agg.preview_views,
      source_counts: mergedSources,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await svc
      .from("thesis_reader_public_views_daily")
      .upsert(row as never, { onConflict: "thesis_id,view_date" });

    if (upsertErr) throw new Error(upsertErr.message);
    upserted += 1;
  }
  return upserted;
}

export async function runReaderAnalyticsRetention(
  svc: SupabaseClient,
  options?: { now?: Date; retentionDays?: number; batchSize?: number },
): Promise<ReaderAnalyticsRetentionResult> {
  const retentionDays = options?.retentionDays ?? READER_ANALYTICS_RAW_RETENTION_DAYS;
  const now = options?.now ?? new Date();
  const cutoffIso = readerAnalyticsRetentionCutoffIso(now, retentionDays);
  const batchSize = options?.batchSize ?? 5_000;

  try {
    const rawRows = await fetchRawOlderThan(svc, cutoffIso, batchSize);
    if (!rawRows.length) {
      return {
        ok: true,
        retentionDays,
        cutoffIso,
        rawScanned: 0,
        dailyUpserted: 0,
        rawDeleted: 0,
      };
    }

    const aggregates = buildDailyAggregatesFromRawEvents(rawRows);
    const dailyUpserted = await mergeDailyAggregates(svc, aggregates);

    const { error: delErr, count } = await svc
      .from("thesis_reader_public_views")
      .delete({ count: "exact" })
      .lt("viewed_at", cutoffIso);

    if (delErr) throw new Error(delErr.message);

    return {
      ok: true,
      retentionDays,
      cutoffIso,
      rawScanned: rawRows.length,
      dailyUpserted,
      rawDeleted: count ?? rawRows.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[DEPTH4] reader analytics retention failed", { cutoffIso, message });
    return {
      ok: false,
      retentionDays,
      cutoffIso,
      rawScanned: 0,
      dailyUpserted: 0,
      rawDeleted: 0,
      error: message,
    };
  }
}

export function topSourcesFromCounts(
  counts: Record<string, number>,
  limit = 5,
): { bucket: ReaderSourceBucket | string; count: number }[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([bucket, count]) => ({ bucket, count }));
}
