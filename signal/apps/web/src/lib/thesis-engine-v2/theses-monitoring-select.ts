import type { Thesis, ThesisQualification } from "./types";
import { isSystemThesisId } from "./system-thesis-ids";

/** Preferred visible Monitoring rows before “See more”. */
export const MONITORING_INITIAL_VISIBLE = 3;

/** Hard cap on Monitoring rows before “See more”. */
export const MONITORING_MAX_BEFORE_MORE = 4;

/** When at least this many candidates exist, aim to show at least this many (soft-fill). */
export const MONITORING_MIN_WHEN_PAIRED = 2;

/** Max rows kept in the Monitoring pool (strict + soft); avoids dumping the whole catalog. */
export const MONITORING_CANDIDATE_CAP = 10;

const QUAL_FOR_SOFT: Record<ThesisQualification, number> = {
  tradeable: 0,
  emerging: 1,
  theme: 2,
};

export function monitoringInitialVisibleCount(rowCount: number): number {
  if (rowCount <= 0) return 0;
  if (rowCount === 1) return 1;
  return Math.min(
    MONITORING_MAX_BEFORE_MORE,
    Math.max(MONITORING_MIN_WHEN_PAIRED, Math.min(MONITORING_INITIAL_VISIBLE, rowCount)),
  );
}

function isWatchingOrForming(t: Thesis): boolean {
  return t.status === "watching" || t.status === "forming";
}

/**
 * Soft pool (ready/active): ACTIVE before READY; then tradeable > emerging > theme; seeded catalog
 * before user theses; then higher probability — keeps Monitor high-signal and macro-first.
 */
export function compareSoftMonitoringCandidates(a: Thesis, b: Thesis): number {
  if (a.status === "active" && b.status !== "active") return -1;
  if (b.status === "active" && a.status !== "active") return 1;
  if (a.status === "ready" && b.status !== "ready") return -1;
  if (b.status === "ready" && a.status !== "ready") return 1;
  const qa = QUAL_FOR_SOFT[a.qualification] ?? 3;
  const qb = QUAL_FOR_SOFT[b.qualification] ?? 3;
  if (qa !== qb) return qa - qb;
  const sysA = isSystemThesisId(a.id) ? 0 : 1;
  const sysB = isSystemThesisId(b.id) ? 0 : 1;
  if (sysA !== sysB) return sysA - sysB;
  return b.probability - a.probability;
}

function compareStrictMonitoring(a: Thesis, b: Thesis): number {
  if (a.status === "watching" && b.status !== "watching") return -1;
  if (b.status === "watching" && a.status !== "watching") return 1;
  return b.probability - a.probability;
}

function dedupeById(rows: Thesis[]): Thesis[] {
  const seen = new Set<string>();
  const out: Thesis[] = [];
  for (const t of rows) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

/**
 * Build the Monitoring shortlist:
 * 1) Watching / forming (strict “setup watch”).
 * 2) Ready / active that sit below the first Focus window (overflow — same curated order as Focus).
 * 3) If still fewer than {@link MONITORING_MIN_WHEN_PAIRED} rows, borrow up to one less than the Focus
 *    window size from the bottom of that window so Focus never empties entirely.
 *
 * Returns rows for Monitoring (strict first, then soft bucket sorted by status, qualification,
 * catalog vs user, probability) and ids borrowed from the Focus window so Focus rendering can
 * exclude them (no duplicate rows). Output is capped at {@link MONITORING_CANDIDATE_CAP}.
 */
export function computeMonitoringSection(args: {
  filtered: Thesis[];
  focusOrdered: Thesis[];
  focusInitialRows: number;
}): { monitoringRows: Thesis[]; borrowedFromFocusIds: Set<string> } {
  const { filtered, focusOrdered, focusInitialRows } = args;
  const eligible = filtered.filter((t) => t.status !== "resolved" && t.status !== "invalidated");

  const strict = eligible.filter(isWatchingOrForming).sort(compareStrictMonitoring);
  const strictIds = new Set(strict.map((t) => t.id));

  const overflow = focusOrdered.slice(focusInitialRows).filter((t) => !strictIds.has(t.id));

  const softParts: Thesis[] = [...overflow];
  const borrowed: Thesis[] = [];
  const window = focusOrdered.slice(0, focusInitialRows);

  const pairCount = dedupeById([...strict, ...softParts]).length;
  if (pairCount < MONITORING_MIN_WHEN_PAIRED && focusOrdered.length >= MONITORING_MIN_WHEN_PAIRED) {
    const need = MONITORING_MIN_WHEN_PAIRED - pairCount;
    const maxBorrow = Math.max(0, window.length - 1);
    const borrowCap = Math.min(need, maxBorrow);
    for (let i = window.length - 1; i >= 0 && borrowed.length < borrowCap; i--) {
      const t = window[i]!;
      if (strictIds.has(t.id)) continue;
      borrowed.push(t);
    }
    softParts.push(...borrowed);
  }

  const softSorted = dedupeById(softParts).sort(compareSoftMonitoringCandidates);
  const softOnly = softSorted.filter((t) => !strictIds.has(t.id));
  const strictPart = strict.slice(0, Math.min(strict.length, MONITORING_CANDIDATE_CAP));
  const roomForSoft = Math.max(0, MONITORING_CANDIDATE_CAP - strictPart.length);
  const ordered = [...strictPart, ...softOnly.slice(0, roomForSoft)];

  return {
    monitoringRows: ordered,
    borrowedFromFocusIds: new Set(borrowed.map((t) => t.id)),
  };
}
