import { describe, expect, it } from "vitest";
import type { ThesisScenario } from "@/lib/thesis-engine-v2/types";
import {
  displayScenarioTripleCleanMessyBroken,
  isCatalogThesisId,
  isUncalibratedDisplayScenarioTriple,
  isUncalibratedScenarioTripleCleanMessyBroken,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";

function scenariosFromTriple(clean: number, messy: number, broken: number): ThesisScenario[] {
  return [
    {
      id: "t-clean",
      thesisId: "th-x",
      pathKey: "clean_win",
      label: "Clean win",
      probability: clean,
      confirmation: "c",
      marketConsequence: "m",
    },
    {
      id: "t-messy",
      thesisId: "th-x",
      pathKey: "messy_win",
      label: "Messy win",
      probability: messy,
      confirmation: "c",
      marketConsequence: "m",
    },
    {
      id: "t-broken",
      thesisId: "th-x",
      pathKey: "thesis_broken",
      label: "Thesis broken",
      probability: broken,
      confirmation: "c",
      marketConsequence: "m",
    },
  ];
}

describe("scenario calibration helpers", () => {
  it("isUncalibratedScenarioTripleCleanMessyBroken matches known templates only", () => {
    expect(isUncalibratedScenarioTripleCleanMessyBroken(40, 35, 25)).toBe(true);
    expect(isUncalibratedScenarioTripleCleanMessyBroken(35, 40, 25)).toBe(true);
    expect(isUncalibratedScenarioTripleCleanMessyBroken(30, 45, 25)).toBe(true);
    expect(isUncalibratedScenarioTripleCleanMessyBroken(33, 34, 33)).toBe(false);
    expect(isUncalibratedScenarioTripleCleanMessyBroken(40, 40, 20)).toBe(false);
  });

  it("isUncalibratedDisplayScenarioTriple derives [clean,messy,broken] from rows", () => {
    expect(isUncalibratedDisplayScenarioTriple(scenariosFromTriple(40, 35, 25))).toBe(true);
    expect(isUncalibratedDisplayScenarioTriple(scenariosFromTriple(38, 37, 25))).toBe(false);
    expect(displayScenarioTripleCleanMessyBroken(scenariosFromTriple(38, 37, 25))).toEqual([38, 37, 25]);
  });

  it("treats incomplete scenario lists as uncalibrated", () => {
    expect(isUncalibratedDisplayScenarioTriple([])).toBe(true);
  });

  it("isCatalogThesisId recognizes shipped catalog thesis ids", () => {
    expect(isCatalogThesisId("th-tlt")).toBe(true);
    expect(isCatalogThesisId("th-gold")).toBe(true);
    expect(isCatalogThesisId("user-local-abc")).toBe(false);
  });
});
