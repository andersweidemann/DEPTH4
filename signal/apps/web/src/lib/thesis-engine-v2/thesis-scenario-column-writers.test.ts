import { describe, expect, it } from "vitest";
import { shouldWriteScenarioProbabilitiesColumnFromNewsCron } from "@/lib/thesis-engine-v2/thesis-scenario-column-writers";

describe("shouldWriteScenarioProbabilitiesColumnFromNewsCron", () => {
  it("refuses catalog seeded_system (column stays seed; evidence log carries automation)", () => {
    expect(shouldWriteScenarioProbabilitiesColumnFromNewsCron("seeded_system")).toBe(false);
  });

  it("allows user and ai_generated theses", () => {
    expect(shouldWriteScenarioProbabilitiesColumnFromNewsCron("user")).toBe(true);
    expect(shouldWriteScenarioProbabilitiesColumnFromNewsCron("ai_generated")).toBe(true);
  });

  it("treats missing origin as writable (legacy rows)", () => {
    expect(shouldWriteScenarioProbabilitiesColumnFromNewsCron(null)).toBe(true);
    expect(shouldWriteScenarioProbabilitiesColumnFromNewsCron("")).toBe(true);
  });
});
