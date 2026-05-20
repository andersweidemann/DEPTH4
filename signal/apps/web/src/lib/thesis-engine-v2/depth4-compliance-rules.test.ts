import { describe, expect, it } from "vitest";
import { DEPTH4_COMPLIANCE_RULE_FOR_LLM } from "@/lib/thesis-engine-v2/depth4-compliance-rules";
import { DEPTH4_PLATFORM_JSON_SYSTEM } from "@/lib/thesis-engine-v2/depth4-llm-system-prompt";

describe("depth4-compliance-rules", () => {
  it("includes imperative and certainty bans", () => {
    expect(DEPTH4_COMPLIANCE_RULE_FOR_LLM).toContain("Never use imperative");
    expect(DEPTH4_COMPLIANCE_RULE_FOR_LLM).toContain("Never state certainty");
    expect(DEPTH4_COMPLIANCE_RULE_FOR_LLM).toContain("probabilistic");
  });

  it("is wired into platform JSON system prompt", () => {
    expect(DEPTH4_PLATFORM_JSON_SYSTEM).toContain(DEPTH4_COMPLIANCE_RULE_FOR_LLM.slice(0, 40));
  });
});
