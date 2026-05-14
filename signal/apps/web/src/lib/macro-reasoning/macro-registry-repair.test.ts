import { describe, expect, it } from "vitest";
import { passesAiThesisRegistryInsertValidation } from "@/lib/theses/ai-registry-depth4-pack";
import { pickAiThesisStatementFromReasoning } from "@/lib/theses/thesis-surfacing-quality";
import {
  mergeMacroReasoningRegistryPatch,
  shouldAttemptRegistryRepair,
} from "@/lib/macro-reasoning/macro-registry-repair";
import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";

/** Minimal valid MacroEventReasoning for merge tests (zod-shaped subset). */
function minimalReasoning(over: Partial<MacroEventReasoning>): MacroEventReasoning {
  const base: MacroEventReasoning = {
    event_summary: "Leaders met for bilateral talks.",
    actors: ["US", "China"],
    geography: ["Asia"],
    domain: "geopolitics",
    direction_of_change: "de-escalation",
    confidence: 0.45,
    first_order_effects: ["Risk tone firms near term on optics."],
    second_order_effects: ["Regional equities gap on headline relief."],
    third_order_effects: ["Policy path still diverges on tariffs over the quarter."],
    impacted_assets: ["L2 — FXI", "L3 — SHCOMP futures"],
    impacted_sectors: ["emerging markets"],
    affected_theses: [],
    thesis_relation: "create_new",
    thesis_trade_line: "Trump in China for talks with Xi Jinping",
    probability_before_pct: null,
    probability_after_pct: null,
    probability_update: "",
    trade_implication: "Neutral FXI — headline risk fades unless tariff language shifts.",
    reasoning_chain: [
      "LEVEL 1 (CONFIRMED TODAY — 0–24h):",
      "Officials confirm a bilateral meeting and staged photo ops; no tariff text yet.",
      "",
      "LEVEL 2 (THIS WEEK — 1–7d):",
      "FXI and regional ADRs gap on relief that talks are happening without new sanctions language.",
      "",
      "LEVEL 3 (THIS MONTH — 7–30d):",
      "The market is pricing a durable thaw, but DEPTH4 sees only optics until export controls and tariff reviews move.",
      "",
      "LEVEL 4 (THIS QUARTER — 30–90d+):",
      "If substance lags, leadership rotates back to exporters and USD liquidity as the real choke point.",
    ].join("\n"),
    reasoning_summary: "Optics run ahead of policy; fade the squeeze if tariffs stay sticky.",
    mispricing_hypothesis: "SHCOMP futures embed a quick deal; the edge is slower tariff relief than priced.",
    per_catalog_thesis: [],
  };
  return { ...base, ...over };
}

describe("macro-registry-repair helpers", () => {
  it("shouldAttemptRegistryRepair only for hero-style failures", () => {
    expect(shouldAttemptRegistryRepair("reject_non_causal_hero_for_registry")).toBe(true);
    expect(shouldAttemptRegistryRepair("reject_registry_hero_base_bar")).toBe(true);
    expect(shouldAttemptRegistryRepair("reject_analyst_style_hero")).toBe(true);
    expect(shouldAttemptRegistryRepair("reject_mispricing_not_specific")).toBe(false);
  });

  it("merge + DEPTH4 pack accepts a repaired hero (Trump-style headline → causal trade)", () => {
    const before = minimalReasoning({});
    expect(
      passesAiThesisRegistryInsertValidation({
        hero: pickAiThesisStatementFromReasoning({
          titleHint: "Trump in China for talks with Xi Jinping",
          thesisTradeLine: before.thesis_trade_line,
          eventSummary: before.event_summary,
        }),
        reasoning: before,
      }).ok,
    ).toBe(false);

    const patch = {
      thesis_trade_line:
        "FXI will fade the meeting pop within weeks if tariff language stays unchanged, as the tape still prices a durable thaw while export controls lag.",
      reasoning_chain: before.reasoning_chain,
      mispricing_hypothesis: before.mispricing_hypothesis,
      reasoning_summary: before.reasoning_summary,
      trade_implication: before.trade_implication,
    };
    const merged = mergeMacroReasoningRegistryPatch(before, patch);
    const hero = pickAiThesisStatementFromReasoning({
      titleHint: "Trump in China for talks with Xi Jinping",
      thesisTradeLine: merged.thesis_trade_line,
      eventSummary: merged.event_summary,
    });
    const gate = passesAiThesisRegistryInsertValidation({ hero, reasoning: merged });
    expect(gate.ok, gate.ok ? "" : gate.reason).toBe(true);
  });
});
