import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedSignal } from "@/lib/thesis-engine-v2/types";

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

/**
 * Recent rows from `public.news_events` (RLS: SELECT true — readable by authenticated app clients).
 * Thesis linkage can be added later via thesis–news mapping; scan layer stays headline-first.
 */
export async function fetchRecentNewsFeedSignals(supabase: SupabaseClient, limit = 24): Promise<FeedSignal[]> {
  const { data, error } = await supabase
    .from("news_events")
    .select("id, headline, source, published_at, one_line_summary, body_text, signal_level")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error || !data?.length) return [];

  return (data as {
    id: string;
    headline: string;
    source: string | null;
    published_at: string | null;
    one_line_summary: string | null;
    body_text: string | null;
    signal_level: number | null;
  }[]).map((row) => {
    const summary =
      (row.one_line_summary ?? "").trim() ||
      (row.body_text ?? "").trim().slice(0, 220) ||
      "";
    const sig = typeof row.signal_level === "number" ? row.signal_level : null;
    const thesisImpact =
      sig !== null && sig >= 3 ? `Signal level ${sig} — worth a click if it touches your book.` : undefined;

    return {
      id: String(row.id),
      source: (row.source ?? "").trim() || "Wire",
      timestamp: formatNewsTimestamp(row.published_at),
      headline: (row.headline ?? "").trim() || "Headline unavailable",
      summary,
      thesisImpact,
    };
  });
}
