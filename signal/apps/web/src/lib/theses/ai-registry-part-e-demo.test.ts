/**
 * Part E — same news *style* as legacy shallow heroes; validates against {@link passesAiThesisRegistryInsertValidation}.
 * Run: `npx vitest run src/lib/theses/ai-registry-part-e-demo.test.ts`
 */
import { describe, expect, it } from "vitest";
import { passesAiThesisRegistryInsertValidation } from "@/lib/theses/ai-registry-depth4-pack";
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

describe("Part E — shallow legacy heroes vs DEPTH4 gate", () => {
  it("PASS: XLE macro hero (insert-eligible shape)", () => {
    const r = baseReasoning();
    const hero =
      "XLE will stay bid into the summer window as the market is pricing too slow a curve tightening, but DEPTH4 sees draws forcing repricing within weeks.";
    expect(passesAiThesisRegistryInsertValidation({ hero, reasoning: r })).toEqual({ ok: true });
  });

  it("PASS: WMB with explicit mispricing + narrow timing (insert-eligible)", () => {
    const r = baseReasoning({
      mispricing_hypothesis:
        "The market is pricing midstream like pure bond proxies; DEPTH4 sees gas growth + rate sensitivity still mispriced into the next two prints.",
    });
    const hero =
      "WMB will lag into the next two prints as the market is pricing rich midstream multiples, but DEPTH4 sees steady gas growth failing to re-rate versus XLU.";
    expect(passesAiThesisRegistryInsertValidation({ hero, reasoning: r })).toEqual({ ok: true });
  });

  it("REJECT: VAALCO shallow hero (non-macro-tradable ticker)", () => {
    const r = baseReasoning();
    const hero =
      "VAALCO may rerate if drilling success changes reserve expectations this quarter.";
    const out = passesAiThesisRegistryInsertValidation({ hero, reasoning: r });
    expect(out.ok).toBe(false);
    expect(out).toEqual({ ok: false, reason: "reject_hero_not_macro_tradable_asset" });
  });

  it("REJECT: Williams shallow — weak hero + chain without explicit mispricing line in L3/L4 slice", () => {
    const weakChain = [
      "LEVEL 1 (CONFIRMED TODAY — 0–24h):",
      "Williams headlines emphasize steady gas throughput and dividend framing without a new catalyst.",
      "",
      "LEVEL 2 (THIS WEEK — 1–7d):",
      "Flows rotate within midstream peers while rates and utility yields set the relative bid.",
      "",
      "LEVEL 3 (THIS MONTH — 7–30d):",
      "Trend continues with supportive backdrop; fundamentals remain solid for steady gas delivery.",
      "",
      "LEVEL 4 (THIS QUARTER — 30–90d+):",
      "Macro backdrop stays broadly supportive for regulated pipelines absent a demand shock.",
    ].join("\n");
    const r = baseReasoning({
      reasoning_chain: weakChain,
      mispricing_hypothesis: "Valuation looks rich versus peers — the market might be wrong about durability.",
    });
    const hero =
      "WMB may lag if valuation stays rich despite only steady gas-growth delivery this quarter.";
    const out = passesAiThesisRegistryInsertValidation({ hero, reasoning: r });
    expect(out.ok).toBe(false);
    expect(
      out.ok === false &&
        (out.reason === "reject_mispricing_not_specific" ||
          out.reason === "reject_reasoning_l34_generic_filler" ||
          out.reason === "reject_missing_explicit_mispricing_signal"),
    ).toBe(true);
  });

  it("REJECT: PPL IR-style headline (fails hero base bar before analyst-style regex)", () => {
    const r = baseReasoning();
    const hero = "PPL Corporation: Long-Term Targets On Track, Shares Near Fair Value.";
    expect(passesAiThesisRegistryInsertValidation({ hero, reasoning: r })).toEqual({
      ok: false,
      reason: "reject_registry_hero_base_bar",
    });
  });

  it("REJECT: IR deck phrasing when hero otherwise passes forward base bar", () => {
    const r = baseReasoning();
    const hero =
      "XLE will underperform into the next FOMC as Long-Term Targets On Track and Shares Near Fair Value dominate positioning.";
    expect(passesAiThesisRegistryInsertValidation({ hero, reasoning: r })).toEqual({
      ok: false,
      reason: "reject_analyst_style_hero",
    });
  });

  it("REJECT: VAALCO with thin L3/L4 (shallow chain)", () => {
    const thinChain = [
      "LEVEL 1 (CONFIRMED TODAY — 0–24h):",
      "Drilling headlines crossed on the tape with management commentary on the well.",
      "",
      "LEVEL 2 (THIS WEEK — 1–7d):",
      "Desks re-rate the name on flow and short interest into the next data release.",
      "",
      "LEVEL 3 (THIS MONTH — 7–30d):",
      "Trend continues; backdrop supportive for energy small caps.",
      "",
      "LEVEL 4 (THIS QUARTER — 30–90d+):",
      "Macro backdrop remains broadly supportive.",
    ].join("\n");
    const r = baseReasoning({
      reasoning_chain: thinChain,
      mispricing_hypothesis: "The market might be wrong about the rerate path.",
    });
    const hero =
      "EGY will rip into earnings season as investors price a clean beat, but DEPTH4 sees reserve risk still embedded.";
    const out = passesAiThesisRegistryInsertValidation({ hero, reasoning: r });
    expect(out.ok).toBe(false);
  });
});
