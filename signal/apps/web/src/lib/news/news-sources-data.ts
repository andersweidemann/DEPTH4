import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  KNOWN_NEWS_SOURCES,
  matchKnownSourceId,
  normalizeSourceLabel,
  SOCRATES_CURATED_SOURCE,
} from "@/lib/news/known-feed-sources";

export type NewsSourceStatus = "active" | "idle" | "error";

export type NewsSourceKind = "rss" | "proprietary";

export type NewsSourceRow = {
  id: string;
  name: string;
  feedUrl: string;
  lastFetchedAt: string | null;
  headlines24h: number;
  status: NewsSourceStatus;
  kind: NewsSourceKind;
  scheduleLabel?: string;
};

export type NewsHeadlineRow = {
  id: string;
  source: string;
  headline: string;
  publishedAt: string;
  timeLabel: string;
  thesisSlug: string | null;
  thesisTitle: string | null;
  impactNote: string;
};

function formatHeadlineTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export async function fetchNewsSourceRows(sb: SupabaseClient): Promise<NewsSourceRow[]> {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const { data: recent } = await sb
    .from("news_events")
    .select("source, published_at")
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(2000);

  const counts = new Map<string, { count: number; lastAt: string | null }>();
  for (const row of recent ?? []) {
    const label = normalizeSourceLabel((row as { source?: string }).source);
    const pub = (row as { published_at?: string }).published_at ?? null;
    const cur = counts.get(label) ?? { count: 0, lastAt: null };
    cur.count += 1;
    if (pub && (!cur.lastAt || pub > cur.lastAt)) cur.lastAt = pub;
    counts.set(label, cur);
  }

  const { data: latestAny } = await sb
    .from("news_events")
    .select("published_at")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const globalLast = latestAny?.published_at ? String(latestAny.published_at) : null;

  function rowForSource(
    src: { id: string; name: string; feedUrl: string; scheduleLabel?: string },
    kind: NewsSourceKind,
  ): NewsSourceRow {
    const agg =
      counts.get(src.name) ??
      counts.get(normalizeSourceLabel(src.name)) ??
      { count: 0, lastAt: null };
    const lastFetchedAt = agg.lastAt ?? (kind === "rss" ? globalLast : null);
    const status: NewsSourceStatus =
      agg.count > 0 ? "active" : kind === "proprietary" ? (lastFetchedAt ? "idle" : "error") : globalLast ? "idle" : "error";
    return {
      id: src.id,
      name: src.name,
      feedUrl: src.feedUrl,
      lastFetchedAt,
      headlines24h: agg.count,
      status,
      kind,
      scheduleLabel: src.scheduleLabel,
    };
  }

  const rssRows = KNOWN_NEWS_SOURCES.map((src) => rowForSource(src, "rss"));
  const socratesRow = rowForSource(SOCRATES_CURATED_SOURCE, "proprietary");
  return [socratesRow, ...rssRows];
}

export async function fetchRecentHeadlines(
  sb: SupabaseClient,
  limit = 12,
): Promise<NewsHeadlineRow[]> {
  const { data: newsRows } = await sb
    .from("news_events")
    .select("id, headline, source, published_at, signal_level")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (!newsRows?.length) return [];

  const ids = newsRows.map((r) => String((r as { id: string }).id));
  const { data: reasoning } = await sb
    .from("event_reasoning")
    .select("news_event_id, reasoning")
    .in("news_event_id", ids)
    .limit(200);

  const hasReasoning = new Set<string>();
  for (const row of reasoning ?? []) {
    const nid = String((row as { news_event_id?: string }).news_event_id ?? "");
    if (nid) hasReasoning.add(nid);
  }

  return newsRows.map((row) => {
    const r = row as {
      id: string;
      headline: string;
      source: string | null;
      published_at: string | null;
      signal_level?: number | null;
    };
    const mapped = hasReasoning.has(r.id);
    return {
      id: r.id,
      source: normalizeSourceLabel(r.source),
      headline: (r.headline ?? "").trim() || "Headline unavailable",
      publishedAt: r.published_at ?? "",
      timeLabel: formatHeadlineTime(r.published_at),
      thesisSlug: null,
      thesisTitle: null,
      impactNote: mapped
        ? "Macro reasoning mapped — check Feed for thesis links"
        : (r.signal_level ?? 0) >= 3
          ? "High-signal headline — thesis impact may be forming"
          : "No thesis impact detected yet",
    };
  });
}

export async function insertUserNewsSubmission(
  sb: SupabaseClient,
  args: { userId: string; url: string; headline: string; body: string },
): Promise<{ id: string }> {
  const urlKey = args.url.trim() || `manual:${randomUUID()}`;
  const { data, error } = await sb
    .from("news_events")
    .insert({
      headline: args.headline.trim() || "Submitted article",
      body_text: args.body.trim() || args.url.trim(),
      source: "User submission",
      source_url: urlKey.slice(0, 2000),
      published_at: new Date().toISOString(),
      signal_level: 2,
      category: "user_submitted",
      raw_json: { submitted_by: args.userId, submit_status: "queued" },
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { id: String(data.id) };
}

export { matchKnownSourceId, normalizeSourceLabel };
