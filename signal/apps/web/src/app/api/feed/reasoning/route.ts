import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildFeedItems } from "@/lib/feed/build-feed-items";
import { isDepth4PublicReadMode } from "@/lib/depth4-public-read-mode";
import type { FeedItem, NewsEvent } from "@/types/feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatNewsTimestamp(iso: string | null): string {
  if (!iso || iso === "—") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reasoningFeedItemToNewsEvent(item: FeedItem): NewsEvent {
  return {
    id: item.id.startsWith("reason-") ? item.id.slice("reason-".length) : item.id,
    source: item.source,
    headline: item.headline,
    timestamp: formatNewsTimestamp(item.timestamp),
    signalLevel: item.signalLevel,
    linkedThesisSlug: item.linkedThesisSlug,
    linkedThesisTitle: item.linkedThesisTitle,
    reasoning: item.body,
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const loadPromoted = !!user || isDepth4PublicReadMode();

  const all = await buildFeedItems(supabase, loadPromoted);
  const items = all.filter((i): i is FeedItem & { type: "reasoning" } => i.type === "reasoning").map(reasoningFeedItemToNewsEvent);
  return NextResponse.json({ items });
}
