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

export type ThesisEvidenceFromLogOpts = {
  /** Current hero conviction; used only to add a short delta note when it diverges materially from the log snapshot. */
  currentConvictionPct?: number | null;
};

function impactFromDelta(d: number): ThesisEvidence["impact"] {
  if (d >= 5) return "major_positive";
  if (d >= 2) return "minor_positive";
  if (d <= -5) return "major_negative";
  if (d <= -2) return "minor_negative";
  return "neutral";
}

const AWAITING_UNCERTAINTY_RE =
  /\b(awaits|awaiting|await\b|still waiting|no response yet|strain|unclear|standoff|tension|cliffhanger|holding pattern|without a deal|before\s+the\s+response)\b/i;

const RESOLUTION_OR_PROGRESS_RE =
  /\b(sends response|sent a response|received the|deal signed|signed the|agreement reached|confirmed the|proposal delivered|responds via|passed through|official text|accepted the proposal)\b/i;

const CONTRADICTION_OR_KINETIC_RE =
  /\b(kinetic|missile strike|walked away|collapse(d)?\s+of\s+talks|invasion|escalation|deal collapse)\b/i;

function maxSingleLegDelta(
  before: { base: number; bull: number; bear: number },
  after: { base: number; bull: number; bear: number },
): number {
  return Math.max(Math.abs(after.base - before.base), Math.abs(after.bull - before.bull), Math.abs(after.bear - before.bear));
}

function evidenceImpactFromInformationContent(args: {
  headline: string;
  convictionDelta: number;
  beforeTriple: EvidenceLogRowLike["probabilityBefore"];
  afterTriple: EvidenceLogRowLike["probabilityAfter"];
}): ThesisEvidence["impact"] {
  const { headline, convictionDelta, beforeTriple, afterTriple } = args;
  const h = headline.toLowerCase();
  const awaiting = AWAITING_UNCERTAINTY_RE.test(h);
  /** Do not treat “… awaits … response …” as resolution — still a cliffhanger. */
  const resolution = RESOLUTION_OR_PROGRESS_RE.test(h) && !awaiting;
  const contradiction = CONTRADICTION_OR_KINETIC_RE.test(h);

  const leg =
    beforeTriple && afterTriple ? maxSingleLegDelta(beforeTriple, afterTriple) : 0;

  if (contradiction) {
    if (convictionDelta < 0) return impactFromDelta(convictionDelta);
    return convictionDelta >= 2 ? "minor_negative" : "neutral";
  }

  if (awaiting && !resolution) {
    return "neutral";
  }

  if (resolution) {
    if (convictionDelta >= 5) return "major_positive";
    if (convictionDelta >= 2) return "minor_positive";
    if (convictionDelta <= -5) return "major_negative";
    if (convictionDelta <= -2) return "minor_negative";
    if (convictionDelta === 0 && leg >= 5) return "minor_positive";
    return "neutral";
  }

  return impactFromDelta(convictionDelta);
}

function buildInterpretation(args: {
  row: EvidenceLogRowLike;
  before: number;
  after: number;
  d: number;
  logScenarioAfterStored: boolean;
  opts?: ThesisEvidenceFromLogOpts;
}): string {
  const { row, before, after, d, logScenarioAfterStored, opts } = args;

  if (row.probabilityBefore && row.probabilityAfter) {
    return d === 0
      ? "Conviction (Clean + Messy) unchanged — scenario mix shifted; compare paths to your invalidation."
      : `Conviction moved from ${before}% to ${after}% after this headline — check resolution paths against your trigger.`;
  }

  if (row.probabilityBefore && !row.probabilityAfter) {
    let tail = "";
    const cur = opts?.currentConvictionPct;
    if (cur != null && Number.isFinite(cur) && Math.abs(cur - before) >= 8) {
      tail = ` Thesis conviction is now ${Math.round(cur)}% (this log row predates that update).`;
    }
    return `Matched development — scenarios were not re-modeled on this row.${tail}`.trim();
  }

  return "Logged development — no scenario triple on this row; check resolution paths manually.";
}

/**
 * Map a `thesis_evidence_log` row into the `ThesisEvidence` shape used by Evidence timeline + assistant.
 * Uses thesis conviction (Clean + Messy) when JSON triples exist; otherwise falls back to headline %.
 */
export function thesisEvidenceFromLogRow(
  row: EvidenceLogRowLike,
  headlineProbabilityFallback: number,
  opts?: ThesisEvidenceFromLogOpts,
): ThesisEvidence {
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

  const impact = evidenceImpactFromInformationContent({
    headline,
    convictionDelta: d,
    beforeTriple: row.probabilityBefore,
    afterTriple: row.probabilityAfter,
  });

  const interpretation = buildInterpretation({
    row,
    before,
    after,
    d,
    logScenarioAfterStored,
    opts,
  });

  return {
    id: `log-${row.id}`,
    thesisId: row.thesisId,
    source: src,
    timestamp: ts,
    headline,
    impact,
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
  opts?: ThesisEvidenceFromLogOpts,
): ThesisEvidence[] {
  const live = [...logRowsForThesis]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => thesisEvidenceFromLogRow(r, headlineProbabilityFallback, opts));
  return [...live, ...bundleEvidence];
}
