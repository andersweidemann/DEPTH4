import { describe, expect, it } from "vitest";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import {
  isThesisMapListableThesis,
  passesDepth4ThesisSurfacingQualityBar,
  pickAiThesisStatementFromReasoning,
  titleLooksLikeRawSourceMaterial,
} from "@/lib/theses/thesis-surfacing-quality";

function minimalThesis(over: Partial<Thesis>): Thesis {
  const base: Thesis = {
    id: "t1",
    slug: "t1",
    title: "Rates will ease sooner than priced as labor softens into Q3.",
    thesisStatement: "Rates will ease sooner than priced as labor softens into Q3.",
    microLabel: null,
    asset: "TLT",
    direction: "long",
    probability: 50,
    status: "watching",
    probabilityRationale: "",
    hiddenDriver: "",
    likelyPath: "",
    marketMisread: "",
    tradeExpression: "",
    whyNow: "Payrolls rolling over while core CPI stays sticky forces a dovish lean before the next dot plot.",
    whatsUnpriced: "Futures still embed three cuts; desk chatter points to four if NFP misses two prints.",
    trigger: "Watch payroll surprise vs whisper.",
    trade: "Add duration on a clean break below 4.35% on tens.",
    invalidation: "Stand down if CPI reaccelerates month-on-month.",
    horizon: "weeks",
    advisoryAction: "watch",
    lastUpdated: new Date().toISOString(),
    qualification: "emerging",
    scores: {
      driverStrength: 10,
      timeCompression: 10,
      marketMispricingScore: 10,
      tradeClarityScore: 8,
      triggerClarityScore: 8,
      total: 46,
    },
    theme: "macro",
    insiderFlow: { bullInstruments: [], bearInstruments: [], confirmTags: [], contradictTags: [] },
  };
  return { ...base, ...over };
}

describe("thesis-surfacing-quality", () => {
  it("titleLooksLikeRawSourceMaterial flags transcript-style headlines", () => {
    expect(
      titleLooksLikeRawSourceMaterial("Clariant AG (CLZNY) Q1 2026 Earnings Call Transcript."),
    ).toBe(true);
    expect(titleLooksLikeRawSourceMaterial("Magellan Aerospace Corporation (MAL:CA) Shareholder/Analyst Call Prepared Remarks Transcript.")).toBe(
      true,
    );
    expect(titleLooksLikeRawSourceMaterial("QQQ will underperform as AI spending squeezes margins before revenue catches up this earnings season.")).toBe(
      false,
    );
  });

  it("passesDepth4ThesisSurfacingQualityBar rejects transcript titles even with narrative fields", () => {
    const t = minimalThesis({
      title: "B3 S.A. - Brasil, Bolsa, Balcão (BOLSY) Q1 2026 Earnings Call Transcript.",
      thesisStatement: "B3 S.A. - Brasil, Bolsa, Balcão (BOLSY) Q1 2026 Earnings Call Transcript.",
    });
    expect(passesDepth4ThesisSurfacingQualityBar(t)).toBe(false);
  });

  it("passesDepth4ThesisSurfacingQualityBar accepts forward-looking hero + substantive why/misread", () => {
    const t = minimalThesis({});
    expect(passesDepth4ThesisSurfacingQualityBar(t)).toBe(true);
  });

  it("passesDepth4 for short BTC-style hero when forward cue is in the title", () => {
    const t = minimalThesis({
      id: "user-btc-style",
      slug: "btc-is-overbought-splt",
      title: "BTC is overbought.",
      thesisStatement: "BTC is overbought.",
      status: "active",
      whyNow: "",
      whatsUnpriced: "",
      trigger: "",
      trade: "",
      invalidation: "",
    });
    expect(passesDepth4ThesisSurfacingQualityBar(t)).toBe(true);
    expect(isThesisMapListableThesis(t)).toBe(true);
  });

  it("pickAiThesisStatementFromReasoning prefers thesis_trade_line over transcript title hint", () => {
    const s = pickAiThesisStatementFromReasoning({
      titleHint: "Piaggio & C. SpA (PGGCY) Q1 2026 Earnings Call Transcript.",
      thesisTradeLine: "European small-cap mobility will re-rate if scooter demand inflects before summer channel checks.",
      eventSummary: "Company held Q1 call.",
    });
    expect(s).toContain("re-rate");
    expect(titleLooksLikeRawSourceMaterial(s)).toBe(false);
  });

  it("pickAiThesisStatementFromReasoning avoids raw hint when trade and summary are empty", () => {
    const s = pickAiThesisStatementFromReasoning({
      titleHint: "SomeCo (ABC) Q1 2026 Earnings Call Transcript.",
      thesisTradeLine: "",
      eventSummary: "",
    });
    expect(s).toBe("AI-discovered thesis");
  });
});
