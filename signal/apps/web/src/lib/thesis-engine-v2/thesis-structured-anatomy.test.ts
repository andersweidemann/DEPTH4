import { describe, expect, it } from "vitest";
import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";
import {
  anatomyFromDraftPayload,
  buildAnatomyFromMacroReasoning,
  validateThesisStructuredAnatomy,
} from "@/lib/thesis-engine-v2/thesis-structured-anatomy";
import {
  inferThesisAssetFamily,
  mechanismGateThesisFromRow,
} from "@/lib/thesis-engine-v2/thesis-event-mechanism-gate";

describe("thesis-structured-anatomy", () => {
  it("accepts a strong anatomy object with explicit mispricing and distinct 4-L", () => {
    const anatomy = anatomyFromDraftPayload({
      title: "TLT underperforms as sticky CPI delays cuts",
      asset: "TLT",
      direction: "short",
      thesis_statement:
        "Sticky core CPI and resilient payrolls keep the Fed higher-for-longer than futures embed, pressuring duration through TLT.",
      why_now: "Next CPI and FOMC sit inside six weeks while the curve still prices aggressive easing.",
      whats_unpriced:
        "The market is still pricing near-term cuts while DEPTH4 sees sticky services inflation keeping the Fed on hold longer.",
      trigger_entry_setup: "Add on a hot CPI print that fails to break the prior yield highs.",
      stop: "A soft CPI plus dovish Fed dots that reprice cuts into the front end.",
      target: "TLT grinds lower as real yields reprice higher over the next two quarters.",
      horizon: "6–12 weeks",
      insider_flow: {
        confirm_tags: ["cpi", "fed", "payrolls"],
        contradict_tags: ["deflation scare"],
        bull_instruments: [],
        bear_instruments: ["TLT"],
      },
    });
    expect(anatomy).not.toBeNull();
    const v = validateThesisStructuredAnatomy(anatomy!, {
      hero: "TLT underperforms as sticky CPI delays cuts",
    });
    expect(v.ok).toBe(true);
    expect(anatomy!.four_level.level3_mispricing).toMatch(/market is still pricing/i);
  });

  it("rejects collapsed mispricing and generic drivers", () => {
    const bad = anatomyFromDraftPayload({
      title: "Macro uncertainty",
      asset: "SPY",
      direction: "long",
      thesis_statement: "Macro uncertainty",
      why_now: "Macro uncertainty",
      whats_unpriced: "Macro uncertainty",
      trigger_entry_setup: "Buy SPY",
      stop: "Sell SPY",
      target: "SPY",
      horizon: "weeks",
      insider_flow: { confirm_tags: [], contradict_tags: [] },
    });
    const v = validateThesisStructuredAnatomy(bad!, { hero: "Macro uncertainty", title: "Macro uncertainty" });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reasons.length).toBeGreaterThan(0);
    }
  });

  it("mechanism gate prefers structured asset_family over title heuristics", () => {
    const gateThesis = mechanismGateThesisFromRow({
      title: "Eurovision fashion week drives luxury sentiment",
      bullInstruments: ["TLT"],
      bearInstruments: [],
      body: {
        thesis_structured_anatomy: {
          schema_version: 1,
          asset_family: "rates",
          primary_drivers: ["Sticky CPI path"],
          secondary_drivers: [],
          mechanism_keywords: ["cpi", "fed"],
          noise_categories: ["entertainment"],
          mispricing_type: "timing",
          market_is_pricing: "The market is still pricing near-term cuts too aggressively.",
          depth4_edge: "Fed stays higher for longer than futures embed.",
          resolution_horizon: "6 weeks",
          resolution_path: "Duration selloff",
          trade_implication: "Short TLT into CPI",
          four_level: {
            level1_narrative: "CPI window is live with futures still priced for fast easing.",
            level2_mechanism: "Sticky services CPI keeps the Fed on hold and lifts real yields.",
            level3_mispricing: "The market is underpricing how long cuts stay delayed versus futures.",
            level4_resolution: "TLT underperforms as the curve bear-steepens into the print.",
          },
        },
      },
    });
    expect(inferThesisAssetFamily(gateThesis)).toBe("rates");
  });
});

describe("buildAnatomyFromMacroReasoning", () => {
  it("builds registry-grade anatomy from macro reasoning", () => {
    const reasoning: MacroEventReasoning = {
      event_summary: "Strait tension rises after naval incident.",
      actors: ["Iran"],
      geography: ["Persian Gulf"],
      domain: "oil",
      direction_of_change: "supply_shock",
      confidence: 0.7,
      first_order_effects: ["Hormuz transit risk lifts insurance premia."],
      second_order_effects: ["Freight rates spike through the chokepoint."],
      third_order_effects: ["OPEC discipline holds while inventories draw."],
      impacted_assets: ["WTI", "USO"],
      impacted_sectors: ["energy"],
      affected_theses: [],
      thesis_relation: "confirm",
      thesis_trade_line: "Long WTI on sustained transit disruption headlines.",
      probability_before_pct: null,
      probability_after_pct: null,
      probability_update: "",
      trade_implication: "Long crude on chokepoint risk.",
      reasoning_summary: "Insurance premia and freight rates signal tighter effective supply.",
      mispricing_hypothesis:
        "The market is still pricing a quick diplomatic fix while futures underprice chokepoint duration risk.",
      reasoning_chain:
        "LEVEL 1 (confirmed): Strait headlines hit the tape with insurance premia rising on the first print.\n" +
        "LEVEL 2 (mechanism): Freight and insurance costs spike, tightening effective supply through the chokepoint.\n" +
        "LEVEL 3 (mispricing): The market is still pricing a quick diplomatic fix while futures underprice chokepoint duration risk.\n" +
        "LEVEL 4 (resolution): Front-month crude reprices higher over several weeks if transit disruption persists.",
      per_catalog_thesis: [],
    };
    const anatomy = buildAnatomyFromMacroReasoning({
      hero: "WTI rips if Hormuz risk reprices supply",
      reasoning,
      assetSymbols: ["WTI"],
    });
    const v = validateThesisStructuredAnatomy(anatomy, { hero: "WTI rips if Hormuz risk reprices supply" });
    expect(v.ok).toBe(true);
    expect(anatomy.asset_family).toBe("oil");
  });
});
