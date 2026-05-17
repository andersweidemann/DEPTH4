import { describe, expect, it } from "vitest";
import type { ThesisListItem } from "@/types/thesis";

/**
 * Regression: list rows only link when `detailResolvable` is true (see ThesisRow in LiveThesesListPage).
 */
function listRowHref(item: ThesisListItem): string | null {
  return item.detailResolvable ? `/theses/${item.slug}` : null;
}

describe("thesis list row navigability", () => {
  it("newly saved user thesis row is navigable when detailResolvable is set", () => {
    const item: ThesisListItem = {
      thesisId: "user-m1abc2",
      slug: "gold-peace-fade-m1abc2",
      title: "Gold fades on peace",
      statement: "Short gold as war premium exits",
      asset: "XAUUSD",
      direction: "short",
      status: "Watching",
      conviction: 55,
      convictionIsTemplateEstimate: false,
      mispricingScore: 42,
      whyNow: "Talks progressing",
      lastUpdated: new Date().toISOString(),
      starred: false,
      detailResolvable: true,
      listBaselineScenarioTriple: { base: 35, bull: 40, bear: 25 },
    };
    expect(listRowHref(item)).toBe("/theses/gold-peace-fade-m1abc2");
  });

  it("non-resolvable row has no href (plain title only in UI)", () => {
    const item: ThesisListItem = {
      thesisId: "ghost",
      slug: "ghost-emerging",
      title: "Ghost",
      statement: "Ghost",
      asset: "USO",
      direction: "long",
      status: "Watching",
      conviction: 50,
      convictionIsTemplateEstimate: true,
      mispricingScore: 30,
      whyNow: "",
      lastUpdated: new Date().toISOString(),
      starred: false,
      detailResolvable: false,
      listBaselineScenarioTriple: { base: 33, bull: 33, bear: 34 },
    };
    expect(listRowHref(item)).toBeNull();
  });
});
