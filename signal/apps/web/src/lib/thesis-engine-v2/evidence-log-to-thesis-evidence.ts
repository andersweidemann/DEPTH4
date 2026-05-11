import type { ThesisEvidence } from "@/lib/thesis-engine-v2/types";
import { thesisConvictionPctFromDbTriple } from "@/lib/thesis-engine-v2/thesis-display-scenarios";

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

function impactFromDelta(d: number): ThesisEvidence["impact"] {
  if (d >= 5) return "major_positive";
  if (d >= 2) return "minor_positive";
  if (d <= -5) return "major_negative";
  if (d <= -2) return "minor_negative";
  return "neutral";
}

/**
 * Map a `thesis_evidence_log` row into the `ThesisEvidence` shape used by Evidence timeline + assistant.
 * Uses thesis conviction (Clean + Messy) when JSON triples exist; otherwise falls back to headline %.
 */
export function thesisEvidenceFromLogRow(row: EvidenceLogRowLike, headlineProbabilityFallback: number): ThesisEvidence {
  const logScenarioAfterStored = !!(row.probabilityBefore && row.probabilityAfter);
  const before = row.probabilityBefore
    ? thesisConvictionPctFromDbTriple(row.probabilityBefore)
    : headlineProbabilityFallback;
  const after = row.probabilityAfter ? thesisConvictionPctFromDbTriple(row.probabilityAfter) : before;
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
  let interpretation: string;
  if (row.probabilityBefore && row.probabilityAfter) {
    interpretation =
      d === 0
        ? `Thesis conviction unchanged at ${before}% after this headline — scenario paths reweighted (Clean / Messy / Broken mix shifted).`
        : `Thesis conviction moved from ${before}% to ${after}% after this headline. Compare resolution paths against your invalidation.`;
  } else if (row.probabilityBefore && !row.probabilityAfter) {
    interpretation = `Thesis conviction snapshot ${before}% at log time — no modeled scenario after-state was stored for this headline (policy / threshold). Still logged as a matched development.`;
  } else {
    interpretation =
      "Logged development — check resolution paths and whether your trigger still matches the tape. Scenario triple was not attached to this row.";
  }

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
    logScenarioAfterStored,
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
