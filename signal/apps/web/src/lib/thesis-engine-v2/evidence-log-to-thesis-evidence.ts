import type { ThesisEvidence } from "@/lib/thesis-engine-v2/types";

export type EvidenceLogRowLike = {
  id: string;
  createdAt: number;
  thesisId: string;
  eventType: string;
  description: string;
  probabilityBefore: { base: number; bull: number; bear: number } | null;
  probabilityAfter: { base: number; bull: number; bear: number } | null;
  metadata?: Record<string, unknown>;
};

function leadScenarioProb(p: { base: number; bull: number; bear: number }): number {
  const k = (["base", "bull", "bear"] as const).reduce((best, x) => (p[x] > p[best] ? x : best), "base");
  return p[k];
}

function impactFromDelta(d: number): ThesisEvidence["impact"] {
  if (d >= 5) return "major_positive";
  if (d >= 2) return "minor_positive";
  if (d <= -5) return "major_negative";
  if (d <= -2) return "minor_negative";
  return "neutral";
}

/**
 * Map a `thesis_evidence_log` row into the `ThesisEvidence` shape used by Evidence timeline + assistant.
 * Uses lead-scenario (messy/clean/broken) probabilities when JSON triples exist; otherwise falls back to headline %.
 */
export function thesisEvidenceFromLogRow(row: EvidenceLogRowLike, headlineProbabilityFallback: number): ThesisEvidence {
  const before = row.probabilityBefore ? leadScenarioProb(row.probabilityBefore) : headlineProbabilityFallback;
  const after = row.probabilityAfter ? leadScenarioProb(row.probabilityAfter) : before;
  const d = after - before;
  const ts = new Date(row.createdAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const src =
    typeof row.metadata?.source === "string" && row.metadata.source.trim()
      ? row.metadata.source.trim()
      : row.eventType || "Evidence";
  const headline = (row.description || "").trim() || row.eventType || "Thesis evidence update";
  const interpretation =
    row.probabilityBefore && row.probabilityAfter
      ? `Scenario mix shifted (lead path ${before}%→${after}%). Review resolution paths vs your invalidation.`
      : "Logged development — check resolution paths and whether your trigger still matches the tape.";

  return {
    id: `log-${row.id}`,
    thesisId: row.thesisId,
    source: src,
    timestamp: ts,
    headline,
    impact: impactFromDelta(d),
    probabilityBefore: before,
    probabilityAfter: after,
    interpretation,
  };
}

/** Newest log-derived items first, then static bundle rows (e.g. onboarding line). */
export function mergeEvidenceTimelineItems(
  logRowsForThesis: EvidenceLogRowLike[],
  bundleEvidence: ThesisEvidence[],
  headlineProbabilityFallback: number,
): ThesisEvidence[] {
  const live = [...logRowsForThesis]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => thesisEvidenceFromLogRow(r, headlineProbabilityFallback));
  return [...live, ...bundleEvidence];
}
