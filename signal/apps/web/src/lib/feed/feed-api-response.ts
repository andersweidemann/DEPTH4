import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedContext, NewsEvent } from "@/types/feed";
import {
  fetchPromotedMacroReasoningRows,
  parseReasoningPayload,
  toPromotedCardModel,
  type EventReasoningNewsJoin,
} from "@/lib/feed/promoted-macro-events";
import { fetchThesisMetaMap, type ThesisMeta } from "@/lib/feed/thesis-slugs";
import { getFeedContextPayload } from "@/lib/feed/feed-context-api";

function formatNewsTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchNewsEventsForFeed(supabase: SupabaseClient, limit: number): Promise<NewsEvent[]> {
  const { data, error } = await supabase
    .from("news_events")
    .select("id, headline, source, published_at, signal_level")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error || !data?.length) return [];

  return (
    data as {
      id: string;
      headline: string | null;
      source: string | null;
      published_at: string | null;
      signal_level: number | null;
    }[]
  ).map((row) => ({
    id: String(row.id),
    source: (row.source ?? "").trim() || "Wire",
    headline: (row.headline ?? "").trim() || "Headline unavailable",
    timestamp: formatNewsTimestamp(row.published_at),
    signalLevel: typeof row.signal_level === "number" ? row.signal_level : undefined,
    linkedThesisSlug: null,
    linkedThesisTitle: null,
  }));
}

function promotedJoinToNewsEvent(row: EventReasoningNewsJoin, thesisMetaById: Map<string, ThesisMeta>): NewsEvent | null {
  const card = toPromotedCardModel(row);
  if (!card) return null;
  const parsed = card.reasoning;
  const reasoningBody = [parsed.reasoning_summary, parsed.reasoning_chain].filter(Boolean).join("\n\n");
  const primaryThesisId = parsed.affected_theses[0];
  const meta = primaryThesisId ? thesisMetaById.get(primaryThesisId) : undefined;
  const newsJoin = parseReasoningPayload(row)?.news;
  const signalLevel = typeof newsJoin?.signal_level === "number" ? newsJoin.signal_level : undefined;

  return {
    id: row.id,
    source: (card.source ?? "").trim() || "Wire",
    headline: card.headline,
    timestamp: card.publishedLabel ?? "",
    signalLevel,
    linkedThesisSlug: meta?.slug ?? null,
    linkedThesisTitle: meta?.title ?? null,
    reasoning: reasoningBody,
  };
}

export async function buildFeedApiPayload(supabase: SupabaseClient, loadPromoted: boolean): Promise<{
  events: NewsEvent[];
  promotedReasoning: NewsEvent[];
  context: FeedContext;
}> {
  const events = await fetchNewsEventsForFeed(supabase, 48);

  let promotedReasoning: NewsEvent[] = [];
  if (loadPromoted) {
    const rows = await fetchPromotedMacroReasoningRows(supabase);
    const thesisIds = rows.flatMap((r) => {
      const m = toPromotedCardModel(r);
      return m ? m.reasoning.affected_theses : [];
    });
    const thesisMetaById = await fetchThesisMetaMap(supabase, thesisIds);
    promotedReasoning = rows
      .map((r) => promotedJoinToNewsEvent(r, thesisMetaById))
      .filter((x): x is NewsEvent => x !== null);
  }

  return {
    events,
    promotedReasoning,
    context: getFeedContextPayload(),
  };
}
