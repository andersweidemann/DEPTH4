/**
 * Lightweight coherence check between prose `horizon` and `timeStop`.
 * Full NLP is out of scope; we flag obvious mismatches (e.g. days–weeks horizon vs quarter-long clock).
 */
export type HorizonTimeStopReview = {
  /** `true` when no red flags from heuristics. */
  ok: boolean;
  /** Shown next to Time stop when `ok` is false. */
  reviewNote: string | null;
};

const RE_WEEKS = /\b(\d+)\s*[-–]\s*(\d+)\s*weeks?\b/i;
const RE_MONTHS = /\b(\d+)\s*[-–]\s*(\d+)\s*months?\b/i;
const RE_QUARTER = /\bquarter\b/i;
const RE_DAYS_WEEKS_HORIZON = /days?\s+to\s+weeks?|weeks?\s+to\s+month/i;
const RE_WEEKS_MONTH_HORIZON = /weeks?\s+to\s+months?/i;

function roughHorizonMaxWeeks(horizon: string): number | null {
  const h = horizon.trim().toLowerCase();
  if (RE_DAYS_WEEKS_HORIZON.test(h)) return 6;
  if (RE_WEEKS_MONTH_HORIZON.test(h)) return 14;
  if (/\bweeks?\b/.test(h) && !/\bmonth/.test(h)) return 8;
  if (/\bmonth(s)?\b/.test(h) && !/\bquarter/.test(h)) return 16;
  return null;
}

function roughTimeStopWeeks(timeStop: string): number | null {
  const t = timeStop.trim().toLowerCase();
  const m = t.match(RE_WEEKS);
  if (m) return Math.max(Number(m[1]), Number(m[2]));
  const m2 = t.match(RE_MONTHS);
  if (m2) return Math.max(Number(m2[1]), Number(m2[2])) * 4;
  if (RE_QUARTER.test(t)) return 14;
  return null;
}

export function evaluateHorizonTimeStopCoherence(horizon: string, timeStop: string | undefined): HorizonTimeStopReview {
  if (!timeStop?.trim()) return { ok: true, reviewNote: null };
  const hw = roughHorizonMaxWeeks(horizon);
  const tw = roughTimeStopWeeks(timeStop);
  if (hw == null || tw == null) {
    if (RE_QUARTER.test(timeStop) && RE_DAYS_WEEKS_HORIZON.test(horizon)) {
      return {
        ok: false,
        reviewNote:
          "Time stop reads much longer than the stated horizon — review so the clock matches the expected holding window (about 2–3× horizon).",
      };
    }
    return { ok: true, reviewNote: null };
  }
  if (tw > hw * 3) {
    return {
      ok: false,
      reviewNote: `Time stop (~${tw}w) is well beyond ~3× the horizon hint (~${hw}w) — worth tightening for consistency.`,
    };
  }
  return { ok: true, reviewNote: null };
}
