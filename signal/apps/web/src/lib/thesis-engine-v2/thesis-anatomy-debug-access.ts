/** When true, anatomy debug is available on thesis detail (still needs raw body or ?debug=1 for guests). */
export function isThesisAnatomyDebugPanelEnvEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEBUG_THESIS_PANEL === "1";
}

function operatorUserIds(): string[] {
  const raw = process.env.NEXT_PUBLIC_DEPTH4_OPERATOR_USER_IDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isThesisAnatomyDebugVisible(input: {
  searchParamsDebug?: string | null;
  userId?: string | null;
}): boolean {
  if (isThesisAnatomyDebugPanelEnvEnabled()) return true;
  if (input.searchParamsDebug === "1") return true;
  const uid = (input.userId ?? "").trim();
  if (uid && operatorUserIds().includes(uid)) return true;
  return false;
}
