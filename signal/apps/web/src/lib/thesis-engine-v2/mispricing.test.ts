import { describe, expect, it } from "vitest";
import { getThesisBySlug } from "@/lib/thesis-engine-v2/catalog-data";
import { mergeThesis } from "@/lib/thesis-engine-v2/thesis-merge";
import { normalizeThesisNarrativeFields } from "@/lib/thesis-engine-v2/thesis-db-body";
import { getThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import {
  currentThesisProbabilityFromThesis,
  defaultScenarioOverridesFromThesis,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

describe("getThesisMispricing", () => {
  it("anchors headline score to qualification total (TLT catalog baseline)", () => {
    const t = normalizeThesisNarrativeFields(getThesisBySlug("fed-pivot-delayed-tlt-weakness")!);
    expect(t.scores.total).toBe(69);
    const m = getThesisMispricing(t);
    expect(m.structuralSetupScore).toBe(69);
    expect(m.thesisProbability).toBe(currentThesisProbabilityFromThesis(t));
    // Default template scenarios: clean 40 / messy 35 / broken 25 → conviction 75; residual nudge 75−69 rounds to 0.
    expect(m.score).toBe(69);
    expect(m.rawSum).toBe(m.components.reduce((a, c) => a + c.value, 0));
    expect(m.convictionVsSetupGap).toBe(m.thesisProbability - 69);
  });

  it("TLT with 31/48/21 paths yields ~68 headline (not legacy 58 from gap×2)", () => {
    const base = normalizeThesisNarrativeFields(getThesisBySlug("fed-pivot-delayed-tlt-weakness")!) as Thesis;
    const o = defaultScenarioOverridesFromThesis(base);
    const t = mergeThesis(base, {
      scenarioOverrides: {
        base: { ...o.base, probability: 48 },
        bull: { ...o.bull, probability: 31 },
        bear: { ...o.bear, probability: 21 },
      },
    });
    expect(currentThesisProbabilityFromThesis(t)).toBe(79);
    const m = getThesisMispricing(t);
    expect(m.structuralSetupScore).toBe(69);
    expect(m.thesisProbability).toBe(79);
    // scenario −2, conviction residual +1 → 68
    expect(m.score).toBe(68);
  });

  it("bumping only thesis.probability without scenario rows does not change mispricing headline", () => {
    const t0 = normalizeThesisNarrativeFields(getThesisBySlug("fed-pivot-delayed-tlt-weakness")!) as Thesis;
    const t1 = mergeThesis(t0, { probability: 95 });
    expect(currentThesisProbabilityFromThesis(t0)).toBe(currentThesisProbabilityFromThesis(t1));
    expect(getThesisMispricing(t0).score).toBe(getThesisMispricing(t1).score);
  });

  it("user thesis picks up small live-evidence nudge only for origin user", () => {
    const base = normalizeThesisNarrativeFields(getThesisBySlug("fed-pivot-delayed-tlt-weakness")!) as Thesis;
    const user = { ...base, origin: "user" as const };
    const a = getThesisMispricing(user, { liveEvidenceCount: 0 });
    const b = getThesisMispricing(user, { liveEvidenceCount: 3 });
    expect(b.score - a.score).toBe(3);
  });
});
