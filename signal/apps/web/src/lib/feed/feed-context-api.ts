import type { FeedContext } from "@/types/feed";

/** Server-only feed sidebar payload (same semantics as the legacy Feed page aside). */
export function getFeedContextPayload(): FeedContext {
  return {
    title: "Feed context",
    description:
      "Promoted narratives use live event_reasoning when discovery clusters are promoted and reasoning has been generated. The headline list reads news_events directly as your ingest pipeline writes them.",
    note: "Star theses to route matching evidence into alerts and the live thesis ticker.",
    sources: ["news_events", "event_reasoning", "thesis_discovery_clusters"],
  };
}
