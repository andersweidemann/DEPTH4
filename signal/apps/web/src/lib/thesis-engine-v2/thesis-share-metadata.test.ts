import { describe, expect, it } from "vitest";
import {
  buildThesisShareDescription,
  buildThesisShareSnapshot,
  clampShareText,
  thesisReaderCanonicalUrl,
  thesisReaderOgImageUrl,
} from "./thesis-share-metadata";
import type { Thesis } from "./types";

function thesis(overrides: Partial<Thesis> = {}): Thesis {
  return {
    id: "t1",
    slug: "strait-hormuz-oil-long",
    title: "USO will rerate higher as Hormuz chokepoint risk spikes within weeks",
    thesisStatement: "USO should rerate higher within weeks if Hormuz transit risk spikes.",
    asset: "USOIL",
    direction: "long",
    probability: 58,
    status: "active",
    probabilityRationale: "",
    whyNow: "",
    whatsUnpriced: "",
    trigger: "",
    trade: "",
    invalidation: "",
    horizon: "Weeks",
    advisoryAction: "hold",
    lastUpdated: "1h",
    qualification: "tradeable",
    theme: "energy",
    hiddenDriver: "",
    likelyPath: "",
    marketMisread: "",
    tradeExpression: "USO upside skew on chokepoint headlines",
    scores: {
      driverStrength: 0,
      timeCompression: 0,
      marketMispricingScore: 0,
      tradeClarityScore: 0,
      triggerClarityScore: 0,
      total: 0,
    },
    insiderFlow: { bullInstruments: [], bearInstruments: [], confirmTags: [] },
    ...overrides,
  };
}

describe("thesis-share-metadata", () => {
  it("builds absolute canonical and OG image URLs", () => {
    expect(thesisReaderCanonicalUrl("strait-hormuz-oil-long")).toBe(
      "https://depth4.com/theses/strait-hormuz-oil-long/read",
    );
    expect(thesisReaderOgImageUrl("strait-hormuz-oil-long")).toBe(
      "https://depth4.com/theses/strait-hormuz-oil-long/read/opengraph-image",
    );
  });

  it("prefers oneLineSummary for description", () => {
    const d = buildThesisShareDescription(
      thesis({
        oneLineSummary: "The strait is fragile but flat crude still underprices a routing shock.",
      }),
    );
    expect(d).toContain("strait is fragile");
    expect(d.length).toBeLessThanOrEqual(161);
  });

  it("clamps long titles for og:title", () => {
    const snap = buildThesisShareSnapshot(
      "x",
      thesis({
        title:
          "This is an extremely long macro thesis title that should be trimmed for social cards and Open Graph previews",
      }),
    );
    expect(snap.ogTitle.length).toBeLessThanOrEqual(60);
    expect(snap.ogTitle.endsWith("…")).toBe(true);
  });

  it("clampShareText respects word boundaries", () => {
    const out = clampShareText("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu", 40);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(40);
  });
});
