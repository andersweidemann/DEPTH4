import type { Thesis } from "@/lib/thesis-engine-v2/types";

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
  if (!patch || Object.keys(patch).length === 0) return base;
  if (patch.scores) {
    const sp = { ...base.scores, ...patch.scores };
    const total = scoreTotalFromParts(sp);
    const scores = { ...sp, total };
    return { ...base, ...patch, scores, qualification: qualificationFromTotal(total) };
  }
  return { ...base, ...patch, scores: base.scores, qualification: base.qualification };
}
