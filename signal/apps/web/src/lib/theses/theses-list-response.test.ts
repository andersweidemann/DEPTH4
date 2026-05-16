import { describe, expect, it } from "vitest";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { buildDetailResolvableSlugSet, listRowWhyNowLine } from "@/lib/theses/theses-list-response";

function baseThesis(over: Partial<Thesis>): Thesis {
  const t: Thesis = {
    id: "x",
    slug: "x",
    title: "Title",
    thesisStatement: "Title",
    microLabel: null,
    asset: "BTC",
    direction: "long",
    probability: 50,
    status: "active",
    probabilityRationale: "",
    hiddenDriver: "",
    likelyPath: "",
    marketMisread: "",
    tradeExpression: "",
    whyNow: "",
    whatsUnpriced: "",
    trigger: "",
    trade: "",
    invalidation: "",
    horizon: "weeks",
    advisoryAction: "watch",
    lastUpdated: new Date().toISOString(),
    qualification: "emerging",
    scores: { driverStrength: 8, timeCompression: 8, marketMispricingScore: 8, tradeClarityScore: 6, triggerClarityScore: 6, total: 36 },
    theme: "macro",
    insiderFlow: { bullInstruments: [], bearInstruments: [], confirmTags: [], contradictTags: [] },
  };
  return { ...t, ...over };
}

describe("theses-list-response helpers", () => {
  it("buildDetailResolvableSlugSet includes catalog, ai, and user slugs only", () => {
    const set = buildDetailResolvableSlugSet(
      [baseThesis({ slug: "ai-slug-only", id: "ai-1" })],
      [baseThesis({ slug: "user-slug-only", id: "user-1" })],
    );
    expect(set.has("ai-slug-only")).toBe(true);
    expect(set.has("user-slug-only")).toBe(true);
    expect(set.has("ghost-emerging-slug")).toBe(false);
    expect(set.has("strait-hormuz-oil-long")).toBe(true);
  });

  it("listRowWhyNowLine falls back to oneLineSummary then microLabel then thesisStatement", () => {
    expect(listRowWhyNowLine(baseThesis({ whyNow: "  Live edge  ", oneLineSummary: "" }))).toBe("Live edge");
    expect(
      listRowWhyNowLine(
        baseThesis({
          whyNow: "",
          oneLineSummary: "One line.",
          microLabel: "micro",
        }),
      ),
    ).toBe("One line.");
    expect(
      listRowWhyNowLine(
        baseThesis({
          whyNow: "",
          oneLineSummary: "",
          microLabel: "  micro  ",
        }),
      ),
    ).toBe("micro");
    expect(
      listRowWhyNowLine(
        baseThesis({
          whyNow: "",
          oneLineSummary: "",
          microLabel: null,
          title: "Short title",
          thesisStatement: "Longer statement for the row.",
        }),
      ),
    ).toBe("Longer statement for the row.");
  });
});
