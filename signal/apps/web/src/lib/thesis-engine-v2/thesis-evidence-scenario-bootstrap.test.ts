import { describe, expect, it } from "vitest";
import { latestNonSeedScenarioTripleByThesisId } from "@/lib/thesis-engine-v2/thesis-evidence-scenario-bootstrap";

describe("latestNonSeedScenarioTripleByThesisId", () => {
  it("picks the newest non-seed triple per thesis (not the oldest row in the batch)", () => {
    const map = latestNonSeedScenarioTripleByThesisId([
      { thesisId: "a", createdAt: 100, probabilityAfter: { base: 40, bull: 35, bear: 25 } },
      { thesisId: "a", createdAt: 300, probabilityAfter: { base: 28, bull: 52, bear: 20 } },
      { thesisId: "a", createdAt: 200, probabilityAfter: { base: 10, bull: 10, bear: 80 } },
    ]);
    expect(map.get("a")).toEqual({ base: 28, bull: 52, bear: 20 });
  });

  it("ignores seed-only history", () => {
    const map = latestNonSeedScenarioTripleByThesisId([
      { thesisId: "b", createdAt: 500, probabilityAfter: { base: 40, bull: 35, bear: 25 } },
      { thesisId: "b", createdAt: 400, probabilityAfter: { base: 40, bull: 35, bear: 25 } },
    ]);
    expect(map.size).toBe(0);
  });

  it("handles multiple theses independently", () => {
    const map = latestNonSeedScenarioTripleByThesisId([
      { thesisId: "x", createdAt: 1, probabilityAfter: { base: 48, bull: 32, bear: 20 } },
      { thesisId: "y", createdAt: 2, probabilityAfter: { base: 30, bull: 45, bear: 25 } },
    ]);
    expect(map.get("x")).toEqual({ base: 48, bull: 32, bear: 20 });
    expect(map.get("y")).toEqual({ base: 30, bull: 45, bear: 25 });
  });
});
