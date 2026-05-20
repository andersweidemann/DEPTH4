import { describe, expect, it } from "vitest";
import { rewriteTargetedThesisLanguage } from "@/lib/thesis/rewrite-targeted";

describe("rewriteTargetedThesisLanguage", () => {
  it("returns empty results when service role is unavailable", async () => {
    await expect(rewriteTargetedThesisLanguage(null)).rejects.toThrow(/service_role/);
  });
});
