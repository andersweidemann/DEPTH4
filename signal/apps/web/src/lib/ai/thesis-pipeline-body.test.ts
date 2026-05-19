import { describe, expect, it } from "vitest";
import {
  buildPipelineBodyPayload,
  candidateNeedsDetailEnrichment,
  isTradePlanComplete,
  verifyPipelineBodyForRender,
} from "@/lib/ai/thesis-pipeline-body";
import type { ThesisCandidate } from "@/lib/ai/thesis-pipeline-types";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

function mkCandidate(overrides: Partial<ThesisCandidate> = {}): ThesisCandidate {
  return {
    title: "Short gold",
    statement: "De-escalation unwinds safe-haven bid.",
    direction: "down",
    targetAssetSymbol: "GC.1",
    targetAssetName: "Gold",
    conviction: 72,
    mispricingScore: 40,
    timeHorizon: "4-8 weeks",
    tradePlan: { entryZone: "3,420–3,450", stop: "3,520", target1: "3,250", target2: "3,150" },
    resolutionPaths: {
      clean: "Ceasefire signed",
      messy: "Talks stall",
      broken: "Escalation resumes",
    },
    evidence: [
      { date: "2026-05-11", source: "Reuters", excerpt: "Iran ceasefire framework" },
      { date: "2026-05-11", source: "Bloomberg", excerpt: "Trump cites progress" },
      { date: "2026-05-10", source: "FT", excerpt: "US military activity drops" },
    ],
    ...overrides,
  };
}

describe("thesis-pipeline-body", () => {
  it("flags incomplete trade plan for enrichment", () => {
    expect(isTradePlanComplete(mkCandidate().tradePlan)).toBe(true);
    expect(
      candidateNeedsDetailEnrichment(
        mkCandidate({ tradePlan: { entryZone: "TBD", stop: "3,520", target1: "3,200", target2: "" } }),
      ),
    ).toBe(true);
  });

  it("builds nested body payload for DB", () => {
    const candidate = mkCandidate();
    const body = buildPipelineBodyPayload(
      { id: "1", slug: "x", title: "t", thesisStatement: "s" } as Thesis,
      candidate,
    );
    expect(body.tradePlan).toMatchObject({ entry_zone: "3,420–3,450", stop: "3,520" });
    expect(Array.isArray(body.evidence)).toBe(true);
    expect((body.evidence as unknown[]).length).toBe(3);
    expect(body.resolutionPaths).toMatchObject({ clean: "Ceasefire signed" });
  });

  it("verify fails when tradePlan missing", () => {
    const body = buildPipelineBodyPayload(
      { id: "1", slug: "x", title: "t", thesisStatement: "s" } as Thesis,
      mkCandidate({ tradePlan: { entryZone: "TBD", stop: "TBD", target1: "TBD", target2: "" } }),
    );
    const v = verifyPipelineBodyForRender(body);
    expect(v.ok).toBe(false);
    expect(v.missing).toContain("tradePlan");
  });

  it("verify passes for complete body", () => {
    const body = buildPipelineBodyPayload(
      { id: "1", slug: "x", title: "t", thesisStatement: "s" } as Thesis,
      mkCandidate(),
    );
    expect(verifyPipelineBodyForRender(body).ok).toBe(true);
  });
});
