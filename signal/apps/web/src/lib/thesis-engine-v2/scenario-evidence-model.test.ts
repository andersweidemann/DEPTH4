import { describe, expect, it } from "vitest";
import {
  buildThesisScenarioEvidenceSnapshot,
  evidenceSnapshotHasMinimumSignals,
  provisionalPercentTripleFromRawScores,
  provisionalTripleIsNotTemplateTriple,
  runScenarioEvidenceModelPipeline,
  scoreScenarioPathsFromSnapshot,
} from "@/lib/thesis-engine-v2/scenario-evidence-model";

const supportiveRow = {
  id: "e1",
  createdAt: Date.now(),
  thesisId: "th-gold",
  eventType: "news_match",
  description: "Peace talks advance",
  probabilityBefore: { base: 40, bull: 35, bear: 25 },
  probabilityAfter: { base: 38, bull: 42, bear: 20 },
};

describe("scenario-evidence-model", () => {
  it("returns no provisional use when evidence is empty", () => {
    const p = runScenarioEvidenceModelPipeline({
      thesisId: "th-gold",
      slug: "war-peace-gold-short",
      evidenceRows: [],
      timeWindowDays: 14,
    });
    expect(p.useProvisional).toBe(false);
    expect(evidenceSnapshotHasMinimumSignals(p.snapshot)).toBe(false);
  });

  it("builds snapshot with minimum signals from a single log row (news + aggregate macro)", () => {
    const snap = buildThesisScenarioEvidenceSnapshot({
      thesisId: "th-gold",
      evidenceRows: [supportiveRow],
      timeWindowDays: 14,
    });
    expect(snap.news_signals).toHaveLength(1);
    expect(snap.macro_signals).toHaveLength(1);
    expect(evidenceSnapshotHasMinimumSignals(snap)).toBe(true);
  });

  it("scoreScenarioPathsFromSnapshot is deterministic for supportive news", () => {
    const snap = buildThesisScenarioEvidenceSnapshot({
      thesisId: "th-gold",
      evidenceRows: [supportiveRow],
      timeWindowDays: 14,
    });
    const scored = scoreScenarioPathsFromSnapshot(snap);
    expect(scored.rawScores.cleanWinScore).toBeGreaterThan(scored.rawScores.brokenThesisScore);
  });

  it("maps all-nonpositive scores to neutral fallback triple", () => {
    const t = provisionalPercentTripleFromRawScores({ cleanWinScore: 0, messyWinScore: 0, brokenThesisScore: 0 });
    expect(t).toEqual({ cleanPct: 33, messyPct: 34, brokenPct: 33 });
  });

  it("provisional softmax leaves template band for sufficiently skewed scores", () => {
    const t = provisionalPercentTripleFromRawScores({ cleanWinScore: 6, messyWinScore: 1, brokenThesisScore: -5 });
    expect(provisionalTripleIsNotTemplateTriple(t)).toBe(true);
  });

  it("pipeline sets useProvisional when evidence is dense and softmax escapes templates", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ ...supportiveRow, id: `e${i}` }));
    const p = runScenarioEvidenceModelPipeline({
      thesisId: "th-gold",
      slug: "war-peace-gold-short",
      evidenceRows: rows,
      timeWindowDays: 14,
    });
    expect(provisionalTripleIsNotTemplateTriple(p.provisional)).toBe(true);
    expect(p.useProvisional).toBe(true);
  });

  it("infers supportive sentiment from thesis-news metadata when probability_after was null (legacy rows)", () => {
    const row = {
      id: "e-meta",
      createdAt: Date.now(),
      thesisId: "user-peace-gold",
      eventType: "NEWS_DEVELOPMENT",
      description: "Ceasefire headline",
      probabilityBefore: { base: 40, bull: 35, bear: 25 },
      probabilityAfter: null,
      metadata: { reasons: ["confirm_tag"] },
    };
    const p = runScenarioEvidenceModelPipeline({
      thesisId: "user-peace-gold",
      slug: "my-peace-gold-short",
      evidenceRows: [row],
      timeWindowDays: 14,
    });
    expect(p.scoreResult.metadata.supportiveCount).toBeGreaterThanOrEqual(1);
    expect(p.snapshot.news_signals[0]?.sentiment).toBe("supportive");
  });
});
