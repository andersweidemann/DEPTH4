import type { CatalogThesisScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { dbScenarioTripleEqualsSeed } from "@/lib/thesis-engine-v2/thesis-display-scenarios";

/**
 * Observed production failure mode: a writer or migration stamped the **same** non-seed triple on many
 * `seeded_system` rows (and/or matching `probability_after`), collapsing headline conviction to **95%** and
 * resolution paths to **15 / 80 / 5** (display) everywhere. That triple is not a shipped catalog default.
 */
export const DEPTH4_REPORTED_BULK_WRITER_COLLAPSE_TRIPLE: CatalogThesisScenarioProbabilities = {
  base: 80,
  bull: 15,
  bear: 5,
};

function tripleEq(a: CatalogThesisScenarioProbabilities, b: CatalogThesisScenarioProbabilities): boolean {
  return a.base === b.base && a.bull === b.bull && a.bear === b.bear;
}

export function isReportedBulkWriterCollapseTriple(p: CatalogThesisScenarioProbabilities): boolean {
  return tripleEq(p, DEPTH4_REPORTED_BULK_WRITER_COLLAPSE_TRIPLE);
}

/**
 * True when **enough** catalog resolutions share one **non-seed** triple and it matches the known bad bulk stamp.
 * Caller passes one entry per catalog row (null when resolve returned null).
 */
export function catalogResolvedTriplesLookLikeBulkWriterCollapse(
  resolved: Array<CatalogThesisScenarioProbabilities | null>,
  opts?: { minNonSeed?: number },
): boolean {
  const min = opts?.minNonSeed ?? 4;
  const material = resolved.filter(
    (r): r is CatalogThesisScenarioProbabilities => r != null && !dbScenarioTripleEqualsSeed(r),
  );
  if (material.length < min) return false;
  const t0 = material[0]!;
  if (!isReportedBulkWriterCollapseTriple(t0)) return false;
  return material.every((r) => tripleEq(r, t0));
}
