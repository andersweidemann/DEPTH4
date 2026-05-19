import { describe, expect, it } from "vitest";
import { mergeAndSortFeedItems } from "@/lib/feed/build-feed-items";
import type { FeedItem } from "@/types/feed";

function item(partial: Partial<FeedItem> & Pick<FeedItem, "id" | "type" | "timestamp">): FeedItem {
  return {
    source: "Wire",
    headline: "H",
    signalLevel: 0,
    thesisSlug: null,
    thesisTitle: null,
    thesisAsset: null,
    thesisDirection: null,
    oldConviction: null,
    newConviction: null,
    changeDirection: null,
    summary: "S",
    linkedThesisSlug: null,
    linkedThesisTitle: null,
    ...partial,
  };
}

describe("mergeAndSortFeedItems", () => {
  it("orders by timestamp descending, then type priority on ties", () => {
    const t = "2025-06-01T12:00:00.000Z";
    const merged = mergeAndSortFeedItems({
      remodel: [],
      conviction: [item({ id: "c1", type: "conviction_change", timestamp: t })],
      reasoning: [item({ id: "r1", type: "reasoning", timestamp: t })],
      headlines: [item({ id: "h1", type: "headline", timestamp: t })],
    });
    expect(merged.map((x) => x.id)).toEqual(["c1", "r1", "h1"]);
  });

  it("puts newer events before older regardless of type", () => {
    const merged = mergeAndSortFeedItems({
      remodel: [],
      conviction: [item({ id: "cold", type: "conviction_change", timestamp: "2025-01-01T00:00:00.000Z" })],
      reasoning: [],
      headlines: [item({ id: "new-h", type: "headline", timestamp: "2025-06-02T00:00:00.000Z" })],
    });
    expect(merged.map((x) => x.id)).toEqual(["new-h", "cold"]);
  });
});
