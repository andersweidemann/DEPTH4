/** When true, anatomy debug is available on thesis detail (still needs raw body or ?debug=1 for guests). */
export function isThesisAnatomyDebugPanelEnvEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEBUG_THESIS_PANEL === "1";
}

/**
 * Client/server helper — prefer `isOperator` from `/api/me/depth4-privileges` on the client.
 * Server components may pass DB-resolved operator flag.
 */
export function isThesisAnatomyDebugVisible(input: {
  searchParamsDebug?: string | null;
  userId?: string | null;
  /** From DB role `operator` or `admin` (Phase 4E). */
  isOperator?: boolean | null;
}): boolean {
  if (isThesisAnatomyDebugPanelEnvEnabled()) return true;
  if (input.searchParamsDebug === "1") return true;
  if (input.isOperator === true) return true;
  return false;
}
