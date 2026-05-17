import { describe, expect, it } from "vitest";
import {
  containsTemplatePhrase,
  isDistinctFromL1,
  stringsNearDuplicate,
} from "@/lib/thesis-engine-v2/thesis-anatomy-debug-heuristics";

describe("thesis-anatomy-debug-heuristics", () => {
  it("detects template phrases", () => {
    expect(containsTemplatePhrase("You named the main driver as oil supply.")).toBe(true);
    expect(containsTemplatePhrase("Iran strike risk lifts front-month crude.")).toBe(false);
  });

  it("flags near-duplicate market vs edge", () => {
    const t = "Market prices a quick de-escalation in the Strait.";
    expect(stringsNearDuplicate(t, t)).toBe(true);
    expect(stringsNearDuplicate(t, "Different edge on timing and path.")).toBe(false);
  });

  it("checks L2 distinct from L1", () => {
    const l1 = "Confirmed: Iran escalates and shipping insurers pull cover.";
    expect(isDistinctFromL1(l1, l1)).toBe(false);
    expect(isDistinctFromL1("Mechanism: freight and war risk premia feed into Brent.", l1)).toBe(true);
  });
});
