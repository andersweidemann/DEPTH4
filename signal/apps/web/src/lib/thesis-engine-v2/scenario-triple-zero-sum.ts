/** DB / evidence shape: base = messy win, bull = clean win, bear = thesis broken. */
export type DbScenarioTriple = { base: number; bull: number; bear: number };

export function sumDbTriple(p: DbScenarioTriple): number {
  return p.base + p.bull + p.bear;
}

/** Sum of per-leg deltas; must be 0 for a pure reallocation. */
export function dbTripleDeltaSum(before: DbScenarioTriple, after: DbScenarioTriple): number {
  return after.base - before.base + (after.bull - before.bull) + (after.bear - before.bear);
}

/**
 * After changing `base`, split the remaining mass (100 − base) between bull and bear
 * proportionally to the prior shape so integer rounding stays exact and deltas zero-sum.
 */
export function redistributeAfterBaseChange(prior: DbScenarioTriple, nextBase: number): DbScenarioTriple {
  const b = Math.round(nextBase);
  const base = Math.min(98, Math.max(1, b));
  const rest = 100 - base;
  const denom = prior.bull + prior.bear;
  let bull = denom > 0 ? Math.round((rest * prior.bull) / denom) : Math.round(rest / 2);
  let bear = rest - bull;
  bull = Math.min(98, Math.max(1, bull));
  bear = Math.min(98, Math.max(1, bear));
  let out: DbScenarioTriple = { base, bull, bear };
  const drift = 100 - sumDbTriple(out);
  if (drift !== 0) {
    bear = Math.min(98, Math.max(1, bear + drift));
    out = { base, bull, bear };
  }
  return out;
}

export function assertZeroSumScenarioShift(
  before: DbScenarioTriple,
  after: DbScenarioTriple,
  context: string,
): void {
  const s = dbTripleDeltaSum(before, after);
  if (s !== 0 && process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(`[DEPTH4] Non–zero-sum scenario shift (${context}): Δsum=${s}`, { before, after });
  }
}
