import { describe, expect, it } from "vitest";
import { rewriteThesisBody } from "@/lib/thesis/rewrite-thesis-body";

describe("rewriteThesisBody", () => {
  it("dryRun flags fields without calling rewrite", async () => {
    const body = {
      summary: "We are initiating a short position in WTI crude oil.",
      trade_plan: { rationale: "Buy at $72." },
    };
    const result = await rewriteThesisBody(body, {
      dryRun: true,
      rewriteFn: async () => "should not run",
    });
    expect(result.changed).toBe(false);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes[0]?.violations.length).toBeGreaterThan(0);
  });

  it("applies rewriteFn to flagged fields", async () => {
    const body = { summary: "We are initiating a short position in WTI." };
    const result = await rewriteThesisBody(body, {
      rewriteFn: async (t) => t.replace(/initiating a short position/i, "a potential downside bias"),
    });
    expect(result.changed).toBe(true);
    expect(result.body.summary).toContain("downside bias");
  });
});
