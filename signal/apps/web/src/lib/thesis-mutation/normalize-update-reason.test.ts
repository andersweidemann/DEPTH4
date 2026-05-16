import { describe, expect, it } from "vitest";
import { normalizeUpdateReason, THESIS_UPDATE_REASON_MAX_LEN } from "@/lib/thesis-mutation/normalize-update-reason";

describe("normalizeUpdateReason", () => {
  it("trims and returns non-empty strings", () => {
    expect(normalizeUpdateReason("  New CPI data weakens timing  ")).toBe("New CPI data weakens timing");
  });

  it("returns null for empty or whitespace-only", () => {
    expect(normalizeUpdateReason("")).toBeNull();
    expect(normalizeUpdateReason("   ")).toBeNull();
    expect(normalizeUpdateReason(null)).toBeNull();
  });

  it("caps length at THESIS_UPDATE_REASON_MAX_LEN", () => {
    const long = "x".repeat(THESIS_UPDATE_REASON_MAX_LEN + 40);
    const out = normalizeUpdateReason(long);
    expect(out).toHaveLength(THESIS_UPDATE_REASON_MAX_LEN);
  });
});
