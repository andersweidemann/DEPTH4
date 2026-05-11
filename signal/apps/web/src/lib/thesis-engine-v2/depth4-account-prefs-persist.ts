/**
 * Persists DEPTH4 per-thesis notify prefs + manual thesis outcomes into `public.users.notification_preferences`
 * (account source of truth). Session keys remain a local cache after hydration.
 */
import { authFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { DEPTH4_NOTIFY_PREFS_SESSION_KEY, DEPTH4_THESIS_OUTCOMES_SESSION_KEY } from "@/lib/thesis-engine-v2/depth4-session-keys";

function readNotifyPrefsJson(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(DEPTH4_NOTIFY_PREFS_SESSION_KEY);
    const j = raw ? (JSON.parse(raw) as unknown) : null;
    if (!j || typeof j !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

let prefsTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePersistDepth4AccountPrefsDebounced(): void {
  if (typeof window === "undefined") return;
  if (prefsTimer) clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => {
    prefsTimer = null;
    void flushDepth4AccountPrefs();
  }, 650);
}

function readOutcomesJson(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(DEPTH4_THESIS_OUTCOMES_SESSION_KEY);
    const j = raw ? (JSON.parse(raw) as unknown) : null;
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function flushDepth4AccountPrefs(): Promise<void> {
  try {
    const sb = createClient();
    const { data: sess } = await sb.auth.getSession();
    const tok = sess.session?.access_token;
    if (!tok) return;

    const depth4ThesisNotifyPrefs = readNotifyPrefsJson();
    const depth4ManualThesisOutcomes = readOutcomesJson();

    await authFetch("/api/user/preferences", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        notification_preferences: {
          depth4ThesisNotifyPrefs,
          depth4ManualThesisOutcomes,
        },
      }),
    });
  } catch {
    // ignore
  }
}
