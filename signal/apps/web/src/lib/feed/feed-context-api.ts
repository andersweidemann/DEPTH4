import type { FeedContext } from "@/types/feed";

/** Server-only feed sidebar payload (same semantics as the legacy Feed page aside). */
export function getFeedContextPayload(): FeedContext {
  return {
    title: "Feed context",
    description:
      "Promoted narratives use live macro reasoning when discovery clusters qualify. Headlines refresh as DEPTH4 ingests wire stories.",
    note: "Star theses to route matching evidence into alerts and the live thesis ticker.",
    sources: ["Macro reasoning", "News wire", "Discovery clusters"],
  };
}
