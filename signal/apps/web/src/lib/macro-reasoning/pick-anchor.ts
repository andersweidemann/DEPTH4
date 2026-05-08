/**
 * Anchor selection for cluster-scoped event_reasoning rows:
 * highest signal_level, then newest published_at (tie-break).
 */

export type AnchorPickInput = {
  id: string;
  signal_level?: number | null;
  published_at?: string | null;
};

export function pickAnchorNewsEventId(members: AnchorPickInput[]): string {
  if (!members.length) {
    throw new Error("pickAnchorNewsEventId: empty members");
  }
  const sorted = [...members].sort((a, b) => {
    const sa = typeof a.signal_level === "number" && Number.isFinite(a.signal_level) ? a.signal_level : 0;
    const sb = typeof b.signal_level === "number" && Number.isFinite(b.signal_level) ? b.signal_level : 0;
    if (sb !== sa) return sb - sa;
    const da = Date.parse(a.published_at ?? "") || 0;
    const db = Date.parse(b.published_at ?? "") || 0;
    return db - da;
  });
  return sorted[0]!.id;
}
