import { describe, expect, it } from "vitest";
import { filterAiActivityFeedItems, mergeAndSortFeedItems } from "@/lib/feed/build-feed-items";
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
      remodel: [item({ id: "m1", type: "thesis_remodel", timestamp: t, linkedThesisSlug: "oil" })],
      created: [],
      status: [],
      conviction: [item({ id: "c1", type: "conviction_change", timestamp: t, linkedThesisSlug: "oil" })],
      evidence: [],
      reasoning: [item({ id: "r1", type: "reasoning", timestamp: t, linkedThesisSlug: "oil" })],
    });
    expect(merged.map((x) => x.id)).toEqual(["m1", "c1", "r1"]);
  });

  it("puts newer events before older regardless of type", () => {
    const merged = mergeAndSortFeedItems({
      remodel: [],
      created: [item({ id: "new-t", type: "thesis_created", timestamp: "2025-06-02T00:00:00.000Z", linkedThesisSlug: "x" })],
      status: [],
      conviction: [item({ id: "cold", type: "conviction_change", timestamp: "2025-01-01T00:00:00.000Z", linkedThesisSlug: "x" })],
      evidence: [],
      reasoning: [],
    });
    expect(merged.map((x) => x.id)).toEqual(["new-t", "cold"]);
  });
});

describe("filterAiActivityFeedItems", () => {
  it("drops headlines and unlinked reasoning", () => {
    const out = filterAiActivityFeedItems([
      item({ id: "h1", type: "headline", timestamp: "2025-06-01T00:00:00.000Z" }),
      item({ id: "r1", type: "reasoning", timestamp: "2025-06-01T00:00:00.000Z" }),
      item({ id: "r2", type: "reasoning", timestamp: "2025-06-01T00:00:00.000Z", linkedThesisSlug: "gold" }),
    ]);
    expect(out.map((x) => x.id)).toEqual(["r2"]);
  });
});
