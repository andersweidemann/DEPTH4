export type DbScenarioTriple = { base: number; bull: number; bear: number };

/**
 * Map macro `probability_*_pct` (thesis **conviction** = chance the idea is broadly right) to a DB-shaped
 * scenario triple (`base` = messy win, `bull` = clean win, `bear` = thesis broken).
 *
 * `thesisConvictionPctFromDbTriple(result)` equals the input conviction, and `base + bull + bear === 100`.
 * Conviction is split between messy vs clean with a stable default mix (~55% messy of the conviction band).
 */
export function dbScenarioTripleFromMacroHeadlineLeadPct(convictionPct: number): DbScenarioTriple {
  if (!Number.isFinite(convictionPct)) {
    return { base: 34, bull: 33, bear: 33 };
  }
  const C = Math.max(0, Math.min(100, Math.round(Number(convictionPct))));
  const bear = 100 - C;
  if (C === 0) return { base: 0, bull: 0, bear: 100 };
  const base = Math.round(C * 0.55);
  const bull = C - base;
  return { base, bull, bear };
}
