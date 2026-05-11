import { describe, expect, it } from "vitest";
import { dbScenarioTripleFromMacroHeadlineLeadPct } from "@/lib/macro-reasoning/macro-headline-probability-to-db-triple";
import { leadScenarioProbabilityFromDbTriple } from "@/lib/thesis-engine-v2/thesis-display-scenarios";

describe("dbScenarioTripleFromMacroHeadlineLeadPct", () => {
  it("USO-style headline 55% → messy lead 55 (matches feed / board contract)", () => {
    const t = dbScenarioTripleFromMacroHeadlineLeadPct(55);
    expect(leadScenarioProbabilityFromDbTriple(t)).toBe(55);
    expect(t.base + t.bull + t.bear).toBe(100);
  });

  it("QQQ-style 60% → lead 60", () => {
    const t = dbScenarioTripleFromMacroHeadlineLeadPct(60);
    expect(leadScenarioProbabilityFromDbTriple(t)).toBe(60);
  });

  it("58% band used in feed copy", () => {
    const t = dbScenarioTripleFromMacroHeadlineLeadPct(58);
    expect(leadScenarioProbabilityFromDbTriple(t)).toBe(58);
  });
});
