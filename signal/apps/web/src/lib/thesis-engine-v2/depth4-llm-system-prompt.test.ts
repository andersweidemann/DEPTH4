import { describe, expect, it } from "vitest";
import {
  DEPTH4_PLATFORM_JSON_SYSTEM,
  buildDepth4LlmSystemPrompt,
  buildDepth4ProseSystemPrompt,
  depth4VoiceBlockForLlm,
} from "@/lib/thesis-engine-v2/depth4-llm-system-prompt";

describe("depth4-llm-system-prompt", () => {
  it("includes global retail constitution in JSON system", () => {
    expect(DEPTH4_PLATFORM_JSON_SYSTEM).toContain("COMPLIANCE RULE");
    expect(DEPTH4_PLATFORM_JSON_SYSTEM).toContain("DEPTH4 GLOBAL WRITING CONSTITUTION");
    expect(DEPTH4_PLATFORM_JSON_SYSTEM).toContain("strict JSON only");
  });

  it("includes voice block in prose system", () => {
    const s = buildDepth4ProseSystemPrompt("You are the DEPTH4 thesis assistant.");
    expect(s).toContain("DEPTH4 RETAIL VOICE TEST");
    expect(s).not.toContain("strict JSON only");
  });

  it("depth4VoiceBlockForLlm matches constitution exports", () => {
    expect(depth4VoiceBlockForLlm()).toContain("RETAIL VOICE");
    expect(buildDepth4LlmSystemPrompt({ preamble: "Role.", jsonOnly: false })).toContain("Role.");
  });
});
