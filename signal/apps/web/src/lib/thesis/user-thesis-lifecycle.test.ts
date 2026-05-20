import { describe, expect, it } from "vitest";
import {
  meetsUserThesisPromotionThresholds,
  readUserCalibrationFromBody,
  shouldHideCalibratedEconomics,
  UNCALIBRATED_SCENARIO_DB,
  userCalibrationToBodyPatch,
} from "@/lib/thesis/user-thesis-lifecycle";
import { isZeroScenarioTripleCleanMessyBroken } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

function userShell(partial: Partial<Thesis> = {}): Thesis {
  return {
    id: "u1",
    slug: "test",
    title: "Test",
    thesisStatement: "Test",
    asset: "DAX",
    direction: "short",
    probability: 0,
    status: "watching",
    probabilityRationale: "",
    origin: "user",
    thesisOrigin: "user",
    hiddenDriver: "",
    likelyPath: "",
    marketMisread: "",
    tradeExpression: "",
    whyNow: "",
    whatsUnpriced: "",
    trigger: "",
    trade: "",
    invalidation: "",
    horizon: "weeks",
    advisoryAction: "watch",
    lastUpdated: "now",
    qualification: "emerging",
    scores: {
      driverStrength: 10,
      timeCompression: 10,
      marketMispricingScore: 10,
      tradeClarityScore: 8,
      triggerClarityScore: 8,
      total: 46,
    },
    theme: "user",
    ...partial,
  };
}

describe("user-thesis-lifecycle", () => {
  it("readUserCalibrationFromBody round-trips", () => {
    const patch = userCalibrationToBodyPatch({ phase: "assessing", summary: "x" });
    expect(readUserCalibrationFromBody(patch)?.phase).toBe("assessing");
  });

  it("meetsUserThesisPromotionThresholds uses > not >=", () => {
    expect(meetsUserThesisPromotionThresholds(60, 20)).toBe(false);
    expect(meetsUserThesisPromotionThresholds(61, 21)).toBe(true);
  });

  it("shouldHideCalibratedEconomics for assessing user thesis", () => {
    const t = userShell({
      userCalibration: { phase: "assessing" },
      scenarioOverrides: {
        base: { probability: 50, confirmation: "a", marketConsequence: "b" },
        bull: { probability: 30, confirmation: "c", marketConsequence: "d" },
        bear: { probability: 20, confirmation: "e", marketConsequence: "f" },
      },
    });
    expect(shouldHideCalibratedEconomics(t)).toBe(true);
  });

  it("zero scenario triple is uncalibrated", () => {
    expect(isZeroScenarioTripleCleanMessyBroken(0, 0, 0)).toBe(true);
    expect(UNCALIBRATED_SCENARIO_DB).toEqual({ base: 0, bull: 0, bear: 0 });
  });
});
