import { dbScenarioTripleEqualsSeed } from "@/lib/thesis-engine-v2/thesis-display-scenarios";

/** Minimal row shape for bootstrapping scenario state from the evidence log batch. */
export type EvidenceScenarioBootstrapRow = {
  thesisId: string;
  createdAt: number;
  probabilityAfter: { base: number; bull: number; bear: number } | null;
};

/**
 * Latest **non-seed** `probability_after` triple per thesis from a batch (e.g. first poll results).
 * Used so the first successful evidence analysis applies to UI immediately — not only on “fresh” rows
 * after `evidenceBootRef` flips (fixes permanent 40/35/25 when historical rows never merged).
 */
export function latestNonSeedScenarioTripleByThesisId(rows: EvidenceScenarioBootstrapRow[]): Map<
  string,
  { base: number; bull: number; bear: number }
> {
  const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt);
  const out = new Map<string, { base: number; bull: number; bear: number }>();
  for (const r of sorted) {
    if (out.has(r.thesisId)) continue;
    const p = r.probabilityAfter;
    if (!p) continue;
    if (dbScenarioTripleEqualsSeed(p)) continue;
    out.set(r.thesisId, p);
  }
  return out;
}
