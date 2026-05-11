export type DbScenarioTriple = { base: number; bull: number; bear: number };

/**
 * Map macro reasoning headline percents (`probability_*_pct`) to a DB-shaped scenario triple
 * (`base` = messy win, `bull` = clean win, `bear` = thesis broken) so
 * `leadScenarioProbabilityFromDbTriple` matches the headline “live thesis probability”.
 *
 * Integer feasibility: with three non‑negative weights summing to 100, the strict maximum equals L
 * only when L ≥ ceil(100/3) (= 34). Below that we clamp L to 34 for the triple only (rare for promoted
 * macro lines; feed copy still stores raw pct in `event_reasoning`).
 */
export function dbScenarioTripleFromMacroHeadlineLeadPct(leadPct: number): DbScenarioTriple {
  if (!Number.isFinite(leadPct)) {
    return { base: 34, bull: 33, bear: 33 };
  }
  let L = Math.max(0, Math.min(100, Math.round(Number(leadPct))));
  if (L === 100) return { base: 100, bull: 0, bear: 0 };
  if (L > 0 && L < 34) L = 34;
  const R = 100 - L;
  const cap = Math.max(0, L - 1);
  let bull = Math.min(Math.floor(R / 2), cap);
  let bear = R - bull;
  while (bear > cap && bull > 0) {
    bull -= 1;
    bear = R - bull;
  }
  if (bull > cap || bear > cap) {
    bull = Math.floor(R / 2);
    bear = R - bull;
  }
  return { base: L, bull, bear };
}
