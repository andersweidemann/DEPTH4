import { describe, expect, it } from "vitest";
import { v2PlanFromDbTier, v2PlanFromUserTier } from "@/lib/thesis-engine-v2/plan";

describe("v2PlanFromUserTier", () => {
  it("maps auth profile tiers to V2 plan slugs", () => {
    expect(v2PlanFromUserTier("Pro")).toBe("pro");
    expect(v2PlanFromDbTier("creator")).toBe("creator");
    expect(v2PlanFromUserTier("Analyst")).toBe("analyst");
    expect(v2PlanFromUserTier("Free")).toBe("free");
    expect(v2PlanFromUserTier(null)).toBe("free");
  });
});

describe("v2PlanFromDbTier", () => {
  it("maps database tier strings to V2 plan slugs", () => {
    expect(v2PlanFromDbTier("pro")).toBe("pro");
    expect(v2PlanFromDbTier("analyst")).toBe("analyst");
    expect(v2PlanFromDbTier("institutional")).toBe("analyst");
    expect(v2PlanFromDbTier("free")).toBe("free");
    expect(v2PlanFromDbTier(null)).toBe("free");
  });
});
