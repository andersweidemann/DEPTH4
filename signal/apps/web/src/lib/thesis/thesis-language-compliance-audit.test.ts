import { describe, expect, it } from "vitest";
import { collectRewritableBodyFields } from "@/lib/thesis/rewrite-thesis-body";
import {
  findComplianceViolations,
  textLikelyNeedsComplianceRewrite,
} from "@/lib/thesis/thesis-language-compliance-audit";

describe("thesis-language-compliance-audit", () => {
  it("flags imperative initiation language", () => {
    const text =
      "We are initiating a short position in WTI crude oil based on an underpriced de-escalation scenario.";
    expect(textLikelyNeedsComplianceRewrite(text)).toBe(true);
    expect(findComplianceViolations(text).some((v) => v.kind === "imperative")).toBe(true);
  });

  it("flags buy-at recommendation language", () => {
    expect(textLikelyNeedsComplianceRewrite("Buy gold at $2,300 with a target of $2,500.")).toBe(true);
  });

  it("flags certainty language", () => {
    expect(textLikelyNeedsComplianceRewrite("The Fed will cut rates in June, driving TLT higher.")).toBe(
      true,
    );
  });

  it("passes probabilistic research framing", () => {
    const text =
      "This thesis suggests WTI may be overpricing geopolitical risk if de-escalation progresses.";
    expect(textLikelyNeedsComplianceRewrite(text)).toBe(false);
  });

  it("collectRewritableBodyFields reads trade_plan and resolution_paths", () => {
    const refs = collectRewritableBodyFields({
      summary: "We are initiating a short position in WTI.",
      trade_plan: { rationale: "Buy at $72 with stop $78." },
      resolution_paths: { clean: "Ceasefire extends and oil fades." },
    });
    expect(refs.some((r) => r.path === "summary")).toBe(true);
    expect(refs.some((r) => r.path === "trade_plan.rationale")).toBe(true);
    expect(refs.some((r) => r.path === "resolution_paths.clean")).toBe(true);
  });
});
