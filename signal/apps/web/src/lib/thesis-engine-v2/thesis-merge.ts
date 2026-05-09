import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { normalizeThesisNarrativeFields } from "@/lib/thesis-engine-v2/thesis-db-body";

export function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

export function scoreTotalFromParts(s: Thesis["scores"]): number {
  return clamp(
    s.driverStrength + s.timeCompression + s.marketMispricingScore + s.tradeClarityScore + s.triggerClarityScore,
    0,
    100,
  );
}

export function qualificationFromTotal(total: number): Thesis["qualification"] {
  if (total >= 65) return "tradeable";
  if (total >= 40) return "emerging";
  return "theme";
}

export function mergeThesis(base: Thesis, patch: Partial<Thesis> | undefined): Thesis {
  if (!patch || Object.keys(patch).length === 0) return normalizeThesisNarrativeFields(base);
  if (patch.scores) {
    const sp = { ...base.scores, ...patch.scores };
    const total = scoreTotalFromParts(sp);
    const scores = { ...sp, total };
    return normalizeThesisNarrativeFields({ ...base, ...patch, scores, qualification: qualificationFromTotal(total) });
  }
  return normalizeThesisNarrativeFields({ ...base, ...patch, scores: base.scores, qualification: base.qualification });
}
