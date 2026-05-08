/** Header ticker line for thesis-engine shell (no fabricated timestamps). */
export function thesesLiveLine(readyCount: number, totalTheses: number): string {
  return `${totalTheses} theses tracked · ${readyCount} ready to trade`;
}
