/**
 * Pure helpers for merging account-backed alert read/dismiss state into in-memory lists.
 * Used after login hydration and in tests (server truth vs client cache boundary).
 */
export type Depth4AlertPersistedState = "read" | "dismissed";

/** Parses GET `/api/user/alert-state` `entries` (also used in tests as login-hydration contract). */
export function parseDepth4AlertStateApiEntries(entries: unknown): Record<string, Depth4AlertPersistedState> {
  const out: Record<string, Depth4AlertPersistedState> = {};
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const k = typeof o.alert_key === "string" ? o.alert_key.trim() : "";
    const st = o.state;
    if (k && (st === "read" || st === "dismissed")) out[k] = st;
  }
  return out;
}

export function mergeDepth4AlertStateRecords(
  base: Record<string, Depth4AlertPersistedState>,
  incoming: Record<string, Depth4AlertPersistedState>,
): Record<string, Depth4AlertPersistedState> {
  return { ...base, ...incoming };
}

/** Drop dismissed; mark read; keep unknown keys as-is. */
export function applyDepth4AlertStateMapToAlerts<T extends { id: string; read: boolean }>(
  alerts: T[],
  stateMap: Record<string, Depth4AlertPersistedState>,
): T[] {
  const out: T[] = [];
  for (const a of alerts) {
    const st = stateMap[a.id];
    if (st === "dismissed") continue;
    if (st === "read") out.push({ ...a, read: true });
    else out.push(a);
  }
  return out;
}
