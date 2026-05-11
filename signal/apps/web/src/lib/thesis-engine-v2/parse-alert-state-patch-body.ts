import type { Depth4AlertPersistedState } from "@/lib/thesis-engine-v2/depth4-alert-state-utils";

export const DEPTH4_ALERT_KEY_MAX_LEN = 240;

const KEY_RE = /^[a-zA-Z0-9._:-]{1,240}$/;

function isState(x: unknown): x is Depth4AlertPersistedState {
  return x === "read" || x === "dismissed";
}

export function parseAlertStatePatchBody(body: unknown):
  | { ok: true; entries: { alert_key: string; state: Depth4AlertPersistedState }[] }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_body" };
  const raw = (body as Record<string, unknown>).entries;
  if (!Array.isArray(raw)) return { ok: false, error: "invalid_entries" };
  if (raw.length > 80) return { ok: false, error: "entries_too_many" };
  const entries: { alert_key: string; state: Depth4AlertPersistedState }[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") return { ok: false, error: "invalid_entry" };
    const o = row as Record<string, unknown>;
    const alert_key = typeof o.alert_key === "string" ? o.alert_key.trim() : "";
    if (!alert_key || alert_key.length > DEPTH4_ALERT_KEY_MAX_LEN || !KEY_RE.test(alert_key)) {
      return { ok: false, error: "invalid_alert_key" };
    }
    if (!isState(o.state)) return { ok: false, error: "invalid_state" };
    entries.push({ alert_key, state: o.state });
  }
  return { ok: true, entries };
}
