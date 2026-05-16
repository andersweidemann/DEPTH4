export const THESIS_UPDATE_REASON_MAX_LEN = 280;

/** Trim, empty → null, cap length for `thesis_updates.reason`. */
export function normalizeUpdateReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length <= THESIS_UPDATE_REASON_MAX_LEN) return trimmed;
  return trimmed.slice(0, THESIS_UPDATE_REASON_MAX_LEN);
}
