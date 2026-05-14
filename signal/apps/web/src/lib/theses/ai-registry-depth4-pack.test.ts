import { describe, expect, it } from "vitest";
import {
  hasExplicitMispricingSignal,
  passesAiThesisRegistryDepth4Pack,
  reasoningChainHasSubstantiveL3L4,
} from "@/lib/theses/ai-registry-depth4-pack";
import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";

function baseReasoning(over: Partial<MacroEventReasoning> = {}): MacroEventReasoning {
  return {
    event_summary: "Cluster moved energy futures.",
    actors: [],
    geography: [],
    domain: "energy",
    direction_of_change: "tighter",
    confidence: 0.55,
    first_order_effects: ["Oil bid."],
    second_order_effects: ["Credit watch."],
    third_order_effects: ["Policy path."],
    impacted_assets: ["L2 — USO"],
    impacted_sectors: ["energy"],
    affected_theses: [],
    thesis_relation: "create_new",
    thesis_trade_line: "",
    probability_before_pct: null,
    probability_after_pct: null,
    probability_update: "",
    trade_implication: "Bullish USO on discipline.",
    reasoning_chain: [
      "LEVEL 1 (CONFIRMED TODAY — 0–24h):",
      "OPEC guidance and inventory draws are confirmed in the member headlines and official comments.",
      "",
      "LEVEL 2 (THIS WEEK — 1–7d):",
      "USO and XLE reprice first while desks resize delta and hedges into the next inventory prints.",
      "",
      "LEVEL 3 (THIS MONTH — 7–30d):",
      "The market is pricing a slow-shale rebound, but DEPTH4 sees discipline plus draws forcing the curve to tighten faster than consensus.",
      "",
      "LEVEL 4 (THIS QUARTER — 30–90d+):",
      "Leadership tilts to cashflow-heavy energy over capex narratives until balances break the other way — XLE and majors stay the clean macro read.",
    ].join("\n"),
    reasoning_summary: "Tests whether OPEC or shale wins the next leg.",
    mispricing_hypothesis: "Futures still price too much elasticity — discipline plus draws proves barrels matter.",
    per_catalog_thesis: [],
    ...over,
  };
}

describe("ai-registry-depth4-pack", () => {
  it("reasoningChainHasSubstantiveL3L4 requires substantive LEVEL 3 and LEVEL 4 bodies", () => {
    const thin = [
      "LEVEL 1 (CONFIRMED — this happened):",
      "Short.",
      "",
      "LEVEL 2 (THIS WEEK–MONTH — near-term):",
      "Short two.",
      "",
      "LEVEL 3 (THIS QUARTER — medium-term):",
      "tiny",
      "",
      "LEVEL 4 (STRUCTURAL BIAS — backdrop this year):",
      "tiny",
    ].join("\n");
    expect(reasoningChainHasSubstantiveL3L4(thin)).toBe(false);
    expect(reasoningChainHasSubstantiveL3L4(baseReasoning().reasoning_chain)).toBe(true);
  });

  it("passesAiThesisRegistryDepth4Pack accepts non-catalog single-ticker hero when causal spine + L3 pattern pass", () => {
    const r = baseReasoning();
    const hero =
      "ARKG will stay under pressure into the next FOMC as the market is pricing a steady biotech bid, but DEPTH4 sees funding stress clearing weaker names first this quarter.";
    expect(passesAiThesisRegistryDepth4Pack({ hero, reasoning: r })).toEqual({ ok: true });
  });

  it("passesAiThesisRegistryDepth4Pack accepts allowlisted macro hero when timing, mispricing pack, and L3–4 pass", () => {
    const r = baseReasoning();
    const xle =
      "XLE will stay bid as OPEC discipline holds while the market still embeds too much shale elasticity into the summer window.";
    expect(passesAiThesisRegistryDepth4Pack({ hero: xle, reasoning: r })).toEqual({ ok: true });
  });

  it("hasExplicitMispricingSignal requires gap language in the combined pack", () => {
    const r = baseReasoning({ mispricing_hypothesis: "Energy moved on headlines today." });
    expect(hasExplicitMispricingSignal(r, "USO will rip higher on vibes into next week.")).toBe(false);
    expect(hasExplicitMispricingSignal(baseReasoning(), "XLE will stay bid as the market still prices too much supply.")).toBe(true);
  });
});
