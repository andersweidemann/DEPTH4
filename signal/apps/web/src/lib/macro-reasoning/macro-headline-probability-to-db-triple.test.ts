import { describe, expect, it } from "vitest";
import { dbScenarioTripleFromMacroHeadlineLeadPct } from "@/lib/macro-reasoning/macro-headline-probability-to-db-triple";
import { thesisConvictionPctFromDbTriple } from "@/lib/thesis-engine-v2/thesis-display-scenarios";

describe("dbScenarioTripleFromMacroHeadlineLeadPct", () => {
  it("USO-style headline 55% conviction → triple sums to 100 and round-trips conviction", () => {
    const t = dbScenarioTripleFromMacroHeadlineLeadPct(55);
    expect(thesisConvictionPctFromDbTriple(t)).toBe(55);
    expect(t.base + t.bull + t.bear).toBe(100);
  });

  it("QQQ-style 60% conviction", () => {
    const t = dbScenarioTripleFromMacroHeadlineLeadPct(60);
    expect(thesisConvictionPctFromDbTriple(t)).toBe(60);
  });

  it("58% band used in feed copy", () => {
    const t = dbScenarioTripleFromMacroHeadlineLeadPct(58);
    expect(thesisConvictionPctFromDbTriple(t)).toBe(58);
  });
});
