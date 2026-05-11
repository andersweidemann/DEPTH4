/**
 * Regression-style tests for DEPTH4 account vs client persistence boundaries.
 */
import { describe, expect, it } from "vitest";
import { mergeDepth4AlertStateRecords } from "@/lib/thesis-engine-v2/depth4-alert-state-utils";

describe("logout vs server truth (alert state map)", () => {
  it("after client clears memory, re-login hydrate merges server rows back", () => {
    const clearedAfterLogout: Record<string, "read" | "dismissed"> = {};
    const serverTruth = { "evidence:a": "dismissed" as const, "evidence:b": "read" as const };
    const afterReloginHydrate = mergeDepth4AlertStateRecords(clearedAfterLogout, serverTruth);
    expect(afterReloginHydrate["evidence:a"]).toBe("dismissed");
    expect(afterReloginHydrate["evidence:b"]).toBe("read");
  });
});

describe("legacy starred merge (session ∪ DB)", () => {
  it("union preserves stars from both sources", () => {
    const fromDb = new Set(["a"]);
    const fromSession = new Set(["b"]);
    const merged = new Set<string>([...Array.from(fromDb), ...Array.from(fromSession)]);
    expect(merged.has("a")).toBe(true);
    expect(merged.has("b")).toBe(true);
  });
});
