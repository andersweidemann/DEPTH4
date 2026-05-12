import { describe, expect, it } from "vitest";
import { mergeUserThesisWithServerCatalog } from "@/lib/thesis-engine-v2/user-thesis-server-merge";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

function baseUserThesis(): Thesis {
  return {
    id: "user-1",
    slug: "my-gold-short",
    title: "Gold short on peace",
    origin: "user",
    status: "active",
    asset: "GLD",
    direction: "short",
    probability: 55,
    scenarioOverrides: {
      base: { probability: 45, confirmation: "messy c", marketConsequence: "messy m" },
      bull: { probability: 30, confirmation: "clean c", marketConsequence: "clean m" },
      bear: { probability: 25, confirmation: "bear c", marketConsequence: "bear m" },
    },
  } as Thesis;
}

describe("mergeUserThesisWithServerCatalog", () => {
  it("does not overwrite scenario weights with the shared DB seed triple", () => {
    const t = mergeUserThesisWithServerCatalog(baseUserThesis(), {
      title: null,
      microLabel: null,
      body: null,
      scenarioProbabilities: { base: 40, bull: 35, bear: 25 },
    });
    expect(t.scenarioOverrides?.bull.probability).toBe(30);
    expect(t.scenarioOverrides?.base.probability).toBe(45);
  });

  it("applies divergent scenario_probabilities from Supabase (post–news cron)", () => {
    const t = mergeUserThesisWithServerCatalog(baseUserThesis(), {
      title: null,
      microLabel: null,
      body: null,
      scenarioProbabilities: { base: 52, bull: 28, bear: 20 },
    });
    expect(t.scenarioOverrides?.base.probability).toBe(52);
    expect(t.scenarioOverrides?.bull.probability).toBe(28);
    expect(t.scenarioOverrides?.bear.probability).toBe(20);
  });

  it("with forceApplyDbProbabilities, applies the shared DB seed triple (server row rebuild)", () => {
    const shell = { ...baseUserThesis(), scenarioOverrides: undefined } as Thesis;
    const t = mergeUserThesisWithServerCatalog(
      shell,
      {
        title: null,
        microLabel: null,
        body: null,
        scenarioProbabilities: { base: 40, bull: 35, bear: 25 },
      },
      { forceApplyDbProbabilities: true },
    );
    expect(t.scenarioOverrides?.base.probability).toBe(40);
    expect(t.scenarioOverrides?.bull.probability).toBe(35);
    expect(t.scenarioOverrides?.bear.probability).toBe(25);
  });
});
