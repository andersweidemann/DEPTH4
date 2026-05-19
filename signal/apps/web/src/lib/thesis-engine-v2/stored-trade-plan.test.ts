import { describe, expect, it } from "vitest";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { storedTradePlanFromThesis } from "@/lib/thesis-engine-v2/stored-trade-plan";

describe("storedTradePlanFromThesis", () => {
  it("reads merged body trade plan fields", () => {
    const thesis = {
      entryZone: "92–94",
      stop: "88.5",
      target1: "98",
      target2: "101",
    } as Thesis;
    expect(storedTradePlanFromThesis(thesis)).toEqual({
      entry_zone: "92–94",
      stop: "88.5",
      target1: "98",
      target2: "101",
    });
  });

  it("returns null for awaiting placeholder", () => {
    const thesis = { entryZone: "Awaiting live setup", stop: "88", target1: "98" } as Thesis;
    expect(storedTradePlanFromThesis(thesis)).toBeNull();
  });
});
