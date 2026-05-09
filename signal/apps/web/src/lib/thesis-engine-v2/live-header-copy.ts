/**
 * Safe default when ready/total counts are not loaded from the same backend as the grid.
 * Avoids implying catalog baseline rows are a live fleet statistic.
 */
export function thesesLiveHeaderNeutral(): string {
  return "Macro thesis workspace";
}

/**
 * Use only when both counts are verified from a real source (e.g. DB query matching the UI).
 */
export function thesesLiveLineVerified(readyCount: number, totalTheses: number): string {
  return `${totalTheses} theses · ${readyCount} ready`;
}
