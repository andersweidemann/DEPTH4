import { describe, expect, it } from "vitest";
import { parseHeadlineAndSourceFromEvidence } from "@/lib/thesis/parse-evidence-headline";

describe("parseHeadlineAndSourceFromEvidence", () => {
  it("reads source from metadata when present", () => {
    const { headline, source } = parseHeadlineAndSourceFromEvidence("[Wire] Oil supply shock", {
      source: "Reuters",
    });
    expect(source).toBe("Reuters");
    expect(headline).toBe("Oil supply shock");
  });

  it("parses bracketed source from description", () => {
    const { headline, source } = parseHeadlineAndSourceFromEvidence(
      "[Bloomberg] Fed signals hold through summer",
      {},
    );
    expect(source).toBe("Bloomberg");
    expect(headline).toBe("Fed signals hold through summer");
  });

  it("falls back to DEPTH4 and full description as headline", () => {
    const { headline, source } = parseHeadlineAndSourceFromEvidence("Plain headline only", null);
    expect(source).toBe("DEPTH4");
    expect(headline).toBe("Plain headline only");
  });
});
