import { describe, expect, it } from "vitest";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import {
  formatReaderTradeSymbol,
  readerMarketMisreadBlock,
  readerThesisNarrative,
  readerTradeRationale,
} from "@/lib/thesis-engine-v2/thesis-reader-sections";

function baseThesis(overrides: Partial<Thesis> = {}): Thesis {
  return {
    id: "1",
    slug: "test",
    title: "Test",
    thesisStatement: "We are initiating a short in WTI crude (CL.1) with medium conviction.",
    asset: "CL.1 — CL.1",
    direction: "short",
    probability: 50,
    status: "ready",
    probabilityRationale: "",
    hiddenDriver: "",
    likelyPath: "",
    marketMisread: "We are initiating a short in WTI crude (CL.1) with medium conviction.",
    tradeExpression: "",
    whyNow: "",
    whatsUnpriced: "The market still prices ceasefire as durable supply relief.",
    trigger: "",
    trade: "Short CL.1 on rallies into $88–90 with stop above $92.",
    invalidation: "",
    horizon: "weeks",
    advisoryAction: "watch",
    lastUpdated: "",
    qualification: "tradeable",
    scores: { driverStrength: 0, timeCompression: 0, marketMispricingScore: 0, tradeClarityScore: 0, triggerClarityScore: 0, total: 0 },
    theme: "energy",
    ...overrides,
  };
}

describe("thesis-reader-sections", () => {
  it("dedupes CL.1 — CL.1 trade symbol", () => {
    expect(formatReaderTradeSymbol(baseThesis())).toBe("CL.1");
  });

  it("uses distinct market misread when statement duplicates marketMisread", () => {
    const t = baseThesis();
    const block = readerMarketMisreadBlock(t);
    expect(block.kind === "single" ? block.text : "").toContain("ceasefire");
    expect(readerThesisNarrative(t)).toContain("initiating a short");
  });

  it("prefers trade line over statement for trade rationale", () => {
    expect(readerTradeRationale(baseThesis())).toContain("Short CL.1");
  });
});
