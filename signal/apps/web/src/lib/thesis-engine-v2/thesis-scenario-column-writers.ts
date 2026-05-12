/**
 * Catalog (`seeded_system`) scenario **columns** are intentionally not overwritten by automated news cron:
 * the same headline + tag match can produce identical `computeSuggestedUpdate` triples for every thesis that
 * still shares the shipped seed prior, which previously stamped one JSON onto all rows. Client + list APIs
 * already lift per-thesis state from `thesis_evidence_log.probability_after` when the column stays seed.
 */
export function shouldWriteScenarioProbabilitiesColumnFromNewsCron(thesisOrigin: string | null | undefined): boolean {
  return (thesisOrigin || "").trim() !== "seeded_system";
}
