import { describe, expect, it } from "vitest";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import {
  applyAnatomySemantics,
  anatomyFromDraftPayload,
  parseThesisStructuredAnatomy,
} from "@/lib/thesis-engine-v2/thesis-structured-anatomy";
import { buildThesisAssetEdgeRows } from "@/components/thesis-engine-v2/ThesisAssetEdgeMap";
import {
  isMispricingClTradeLeak,
  resolveAssetMispricingText,
} from "@/lib/thesis-engine-v2/thesis-asset-edge-mispricing";
import { containsClEntryParagraph, stringsNearDuplicate } from "@/lib/thesis-engine-v2/thesis-text-similarity";

function oilThesisBase(): Thesis {
  return {
    id: "t1",
    slug: "iran-cl-test",
    title: "Long CL on Strait escalation",
    thesisStatement: "Long CL as Iran escalation keeps supply risk in the front end.",
    asset: "CL",
    direction: "long",
    whyNow: "Confirmed tanker insurance pull and Strait rhetoric this week.",
    whatsUnpriced:
      "The market is still pricing a quick diplomatic off-ramp while futures under-embed sustained supply risk.",
    tradeExpression:
      "Long CL front-month above 78 with stop 74.50 and target 86 if insurance stays withdrawn.",
    trigger: "Add on fresh Tier-1 escalation headline with CL holding the breakout.",
    trade: "Long CL",
    invalidation: "Hard de-escalation headline with CL back below 74.",
    horizon: "4–8 weeks",
    status: "forming",
    qualification: "emerging",
    scores: { driverStrength: 10, timeCompression: 10, marketMispricingScore: 10, tradeClarityScore: 10, triggerClarityScore: 10 },
    insiderFlow: { bullInstruments: ["CL", "XLE"], bearInstruments: ["SPY", "JETS", "UUP"] },
  } as Thesis;
}

describe("thesis-asset-edge-mispricing (3B.2)", () => {
  it("does not paste CL entry paragraph onto SPY/JETS rows", () => {
    const thesis = oilThesisBase();
    const rows = buildThesisAssetEdgeRows(thesis, [
      { symbol: "CL", note: "primary" },
      { symbol: "SPY", note: "risk-off" },
      { symbol: "JETS", note: "airlines" },
    ]);
    const spy = rows.find((r) => r.symbol === "SPY")!;
    const jets = rows.find((r) => r.symbol === "JETS")!;
    expect(spy.mispriced.toLowerCase()).not.toMatch(/stop 74\.50/);
    expect(jets.mispriced.toLowerCase()).toMatch(/jet-fuel|margin|airline/i);
    expect(containsClEntryParagraph(spy.mispriced)).toBe(false);
    expect(containsClEntryParagraph(jets.mispriced)).toBe(false);
  });

  it("detects CL trade leak on non-crude symbols", () => {
    const thesis = oilThesisBase();
    const leak = thesis.tradeExpression!;
    expect(isMispricingClTradeLeak(leak, "SPY", thesis)).toBe(true);
    expect(isMispricingClTradeLeak(leak, "CL", thesis)).toBe(false);
  });

  it("strips template L2 and splits market vs edge on reconcile", () => {
    const raw = parseThesisStructuredAnatomy({
      schema_version: 1,
      asset_family: "rates",
      primary_drivers: ["oil"],
      secondary_drivers: [],
      mechanism_keywords: ["iran"],
      noise_categories: [],
      mispricing_type: "timing",
      market_is_pricing: "The market is still pricing a quick diplomatic off-ramp.",
      depth4_edge: "The market is still pricing a quick diplomatic off-ramp.",
      resolution_horizon: "weeks",
      resolution_path: "",
      trade_implication: "",
      four_level: {
        level1_narrative: "Confirmed Strait escalation headlines this week.",
        level2_mechanism:
          "You named the main driver in your draft; incoming headlines will test whether it still holds.",
        level3_mispricing: "The market is still pricing a quick diplomatic off-ramp.",
        level4_resolution: "CL holds above 78 into month-end.",
      },
    });
    expect(raw).not.toBeNull();
    const reconciled = applyAnatomySemantics(raw!, {
      asset: "CL",
      direction: "long",
      thesis_statement: oilThesisBase().thesisStatement,
      why_now: oilThesisBase().whyNow!,
      whats_unpriced: oilThesisBase().whatsUnpriced!,
      bullInstruments: ["CL"],
      bearInstruments: ["SPY"],
    });
    expect(reconciled.four_level.level2_mechanism.toLowerCase()).not.toMatch(/you named the main driver/);
    expect(reconciled.four_level.level2_mechanism.toLowerCase()).toMatch(/mechanism|flows|positioning|near-term/i);
    expect(stringsNearDuplicate(reconciled.market_is_pricing, reconciled.depth4_edge)).toBe(false);
    expect(reconciled.asset_family).toBe("oil");
  });

  it("defense stub mentions backlog for RTX when no anatomy", () => {
    const thesis = {
      ...oilThesisBase(),
      asset: "RTX",
      tradeExpression: "",
      whatsUnpriced: "Defense names lag conflict premium.",
      insiderFlow: { bullInstruments: ["RTX", "ITA"], bearInstruments: [] },
    } as Thesis;
    const text = resolveAssetMispricingText({
      symbol: "RTX",
      thesis,
      biasLabel: "Primary · bullish",
    });
    expect(text.toLowerCase()).toMatch(/rtx|backlog|procurement/);
  });
});

describe("anatomyFromDraftPayload L2 (3B.2)", () => {
  it("replaces hidden_driver template in new anatomy", () => {
    const anatomy = anatomyFromDraftPayload({
      asset: "CL",
      direction: "long",
      thesis_statement: "Long CL on supply risk.",
      why_now: "Escalation confirmed in the Strait.",
      whats_unpriced: "Market prices fast de-escalation.",
      hidden_driver: "You named the main driver in your draft; incoming headlines will test whether it still holds.",
      likely_path: "Insurance pull feeds into front-month crude over the next week.",
      trigger_entry_setup: "Add on CL holding breakout.",
      horizon: "4 weeks",
    });
    expect(anatomy?.four_level.level2_mechanism.toLowerCase()).not.toMatch(/your draft/);
    expect(anatomy?.four_level.level2_mechanism).toMatch(/Insurance pull|week/i);
  });
});
