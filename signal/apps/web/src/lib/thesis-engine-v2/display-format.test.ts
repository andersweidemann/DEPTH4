import { describe, expect, it } from "vitest";
import {
  evidenceConvictionSummary,
  formatEvidenceEventLabel,
  formatEvidenceSource,
  formatThesisDisplayTimestamp,
} from "@/lib/thesis-engine-v2/display-format";
import type { ThesisEvidence } from "@/lib/thesis-engine-v2/types";

describe("formatThesisDisplayTimestamp", () => {
  it("uses en-US month/day formatting", () => {
    const ts = formatThesisDisplayTimestamp(Date.UTC(2026, 4, 11, 0, 5));
    expect(ts).toMatch(/May/);
    expect(ts).toMatch(/11/);
    expect(ts).not.toMatch(/月/);
  });
});

describe("evidence labels", () => {
  it("maps internal event types and sources to user-facing labels", () => {
    expect(formatEvidenceEventLabel("NEWS_DEVELOPMENT")).toBe("News development");
    expect(formatEvidenceSource("news_events")).toBe("News wire");
  });
});

describe("evidenceConvictionSummary", () => {
  it("omits summary when scenarios were not stored on the row", () => {
    const ev = {
      logScenarioAfterStored: false,
      probabilityBefore: 70,
      probabilityAfter: 70,
    } as ThesisEvidence;
    expect(evidenceConvictionSummary(ev)).toBeNull();
  });

  it("shows unchanged conviction in one line", () => {
    const ev = {
      logScenarioAfterStored: true,
      probabilityBefore: 72,
      probabilityAfter: 72,
    } as ThesisEvidence;
    expect(evidenceConvictionSummary(ev)).toBe("Conviction 72% (unchanged)");
  });
});
