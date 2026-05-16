import { describe, expect, it } from "vitest";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { CATALOG_THESES } from "@/lib/thesis-engine-v2/catalog-data";
import {
  buildDetailResolvableSlugSet,
  computeDetailResolvableForListRow,
  listRowWhyNowLine,
  thesisListItemFromEngine,
} from "@/lib/theses/theses-list-response";
import { partitionHomeBuckets } from "@/lib/theses/thesis-home-surfacing";

const USO_GHOST_SLUG = "uso-will-find-a-floor-within-this-earnings-s-9535544b43";
const DB_AI_ID = "550e8400-e29b-41d4-a716-446655440001";
const DB_USER_ID = "660e8400-e29b-41d4-a716-446655440002";

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
      [baseThesis({ slug: "ai-slug-only", id: DB_AI_ID, thesisOrigin: "ai_generated" })],
      [baseThesis({ slug: "user-slug-only", id: DB_USER_ID, thesisOrigin: "user" })],
    );
    expect(set.has("ai-slug-only")).toBe(true);
    expect(set.has("user-slug-only")).toBe(true);
    expect(set.has("ghost-emerging-slug")).toBe(false);
    expect(set.has("strait-hormuz-oil-long")).toBe(true);
    expect(set.has(USO_GHOST_SLUG)).toBe(false);
  });

  it("USO ghost emerging slug is not detailResolvable when not DB-backed", () => {
    const ghost = baseThesis({
      id: "ghost-catalog-clone",
      slug: USO_GHOST_SLUG,
      status: "forming",
      qualification: "emerging",
    });
    const set = buildDetailResolvableSlugSet([], []);
    expect(set.has(USO_GHOST_SLUG)).toBe(false);
    expect(computeDetailResolvableForListRow(ghost, set)).toBe(false);

    const partition = partitionHomeBuckets([ghost]);
    const item = thesisListItemFromEngine(ghost, false, null, partition, set);
    expect(item.detailResolvable).toBe(false);
  });

  it("USO ghost slug stays non-resolvable even if slug were wrongly in the set", () => {
    const ghost = baseThesis({
      id: "not-a-db-uuid",
      slug: USO_GHOST_SLUG,
      status: "forming",
    });
    const polluted = new Set([USO_GHOST_SLUG]);
    expect(computeDetailResolvableForListRow(ghost, polluted)).toBe(false);
  });

  it("DB-backed ai_generated forming thesis remains detailResolvable", () => {
    const slug = "db-backed-emerging-oil-floor";
    const ai = baseThesis({
      id: DB_AI_ID,
      slug,
      status: "forming",
      thesisOrigin: "ai_generated",
      title: "USO will find a floor before revenue re-rates",
      thesisStatement: "USO will find a floor before revenue re-rates",
    });
    const set = buildDetailResolvableSlugSet([ai], []);
    expect(set.has(slug)).toBe(true);
    expect(computeDetailResolvableForListRow(ai, set)).toBe(true);

    const partition = partitionHomeBuckets([ai]);
    const item = thesisListItemFromEngine(ai, false, null, partition, set);
    expect(item.detailResolvable).toBe(true);
  });

  it("catalog emerging thesis remains detailResolvable", () => {
    const catalog = CATALOG_THESES.find((t) => t.slug === "strait-hormuz-oil-long");
    expect(catalog).toBeDefined();
    const set = buildDetailResolvableSlugSet([], []);
    expect(computeDetailResolvableForListRow(catalog!, set)).toBe(true);
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
