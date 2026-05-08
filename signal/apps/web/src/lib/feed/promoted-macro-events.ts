import type { SupabaseClient } from "@supabase/supabase-js";
import { safeParseMacroEventReasoning } from "@/lib/macro-reasoning/schema";
import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";

/** Row shape from `event_reasoning` + embedded `news_events` (FK from news_event_id). */
export type EventReasoningNewsJoin = {
  id: string;
  news_event_id: string;
  cluster_id: string | null;
  reasoning: unknown;
  model: string;
  prompt_version: string;
  created_at: string;
  news_events:
    | {
        headline: string;
        source: string | null;
        published_at: string | null;
        signal_level: number | null;
      }
    | {
        headline: string;
        source: string | null;
        published_at: string | null;
        signal_level: number | null;
      }[]
    | null;
};

function normalizeNewsJoin(
  raw: EventReasoningNewsJoin["news_events"],
): {
  headline: string;
  source: string | null;
  published_at: string | null;
  signal_level: number | null;
} | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

/**
 * Latest `event_reasoning` per promoted cluster (by `created_at` desc).
 * Requires authenticated Supabase client — `event_reasoning` RLS is SELECT for authenticated only.
 */
export async function fetchPromotedMacroReasoningRows(
  supabase: SupabaseClient,
): Promise<EventReasoningNewsJoin[]> {
  const { data: promoted, error: pErr } = await supabase.from("thesis_discovery_clusters").select("id").eq("status", "promoted");

  if (pErr || !promoted?.length) return [];

  const clusterIds = promoted.map((r) => r.id).filter((id): id is string => typeof id === "string");
  if (!clusterIds.length) return [];

  const { data: rows, error } = await supabase
    .from("event_reasoning")
    .select(
      `
      id,
      news_event_id,
      cluster_id,
      reasoning,
      model,
      prompt_version,
      created_at,
      news_events ( headline, source, published_at, signal_level )
    `,
    )
    .in("cluster_id", clusterIds)
    .order("created_at", { ascending: false });

  if (error || !rows?.length) return [];

  const seen = new Set<string>();
  const deduped: EventReasoningNewsJoin[] = [];
  for (const r of rows as EventReasoningNewsJoin[]) {
    const cid = r.cluster_id;
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    deduped.push(r);
  }
  return deduped;
}

/** Latest reasoning row for anchor `news_event_id` (newest `created_at`). */
export async function fetchReasoningByNewsEventId(
  supabase: SupabaseClient,
  newsEventId: string,
): Promise<EventReasoningNewsJoin | null> {
  const { data, error } = await supabase
    .from("event_reasoning")
    .select(
      `
      id,
      news_event_id,
      cluster_id,
      reasoning,
      model,
      prompt_version,
      created_at,
      news_events ( headline, source, published_at, signal_level )
    `,
    )
    .eq("news_event_id", newsEventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as EventReasoningNewsJoin;
}

export function parseReasoningPayload(row: EventReasoningNewsJoin): {
  parsed: MacroEventReasoning;
  news: ReturnType<typeof normalizeNewsJoin>;
} | null {
  const parsed = safeParseMacroEventReasoning(row.reasoning);
  if (!parsed.ok) return null;
  return { parsed: parsed.data, news: normalizeNewsJoin(row.news_events) };
}

export type PromotedCardModel = {
  row: EventReasoningNewsJoin;
  reasoning: MacroEventReasoning;
  headline: string;
  source: string | null;
  publishedLabel: string | null;
};

export function toPromotedCardModel(row: EventReasoningNewsJoin): PromotedCardModel | null {
  const pr = parseReasoningPayload(row);
  if (!pr) return null;
  const news = pr.news;
  const headline = news?.headline?.trim() || pr.parsed.event_summary.slice(0, 200);
  const publishedLabel =
    news?.published_at != null && news.published_at !== ""
      ? new Date(news.published_at).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
  return {
    row,
    reasoning: pr.parsed,
    headline,
    source: news?.source ?? null,
    publishedLabel,
  } satisfies PromotedCardModel;
}
