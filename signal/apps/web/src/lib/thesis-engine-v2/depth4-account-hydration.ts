/**
 * Hydrates DEPTH4 personal state from the authenticated Supabase account after sign-in.
 *
 * **Source of truth:** `thesis_stars`, `depth4_user_book`, `depth4_user_alert_state`,
 * `public.theses` (user rows), `public.users.notification_preferences` keys `depth4ThesisNotifyPrefs` +
 * `depth4ManualThesisOutcomes`.
 * **Session keys** (`depth4-session-keys.ts`) are caches for responsiveness — not authoritative.
 *
 * Ephemeral UI (drawer open, unsaved drafts) intentionally stays client-only.
 *
 * Full matrix of what is account vs device vs ephemeral: `depth4-personal-state-inventory.ts`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEPTH4_STARRED_SESSION_KEY,
  DEPTH4_NOTIFY_PREFS_SESSION_KEY,
  DEPTH4_THESIS_OUTCOMES_SESSION_KEY,
  DEPTH4_THESIS_OUTCOMES_CHANGED_EVENT,
} from "@/lib/thesis-engine-v2/depth4-session-keys";
import { loadPositions, savePositions } from "@/lib/thesis-engine-v2/positions-store";
import { saveUserTheses, loadUserTheses } from "@/lib/thesis-engine-v2/user-theses";
import { userThesisFromSupabaseRow } from "@/lib/thesis-engine-v2/user-thesis-from-db-row";
import type { ManualThesisOutcome } from "@/lib/thesis-engine-v2/thesis-outcomes-store";
import type { Position, Thesis } from "@/lib/thesis-engine-v2/types";
import { schedulePersistDepth4AccountPrefsDebounced } from "@/lib/thesis-engine-v2/depth4-account-prefs-persist";
import { schedulePersistBookPositionsDebounced } from "@/lib/thesis-engine-v2/depth4-book-positions-persist";
import { flushPendingDepth4AlertStates } from "@/lib/thesis-engine-v2/depth4-alert-state-persist";
import { parseDepth4AlertStateApiEntries, type Depth4AlertPersistedState } from "@/lib/thesis-engine-v2/depth4-alert-state-utils";

type NotifyPref = "any" | "major" | "consequence" | "mute";

function readStarredSession(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(DEPTH4_STARRED_SESSION_KEY);
    const j = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(j)) return new Set();
    return new Set(j.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeStarredSession(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DEPTH4_STARRED_SESSION_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

function readNotifyPrefsSession(): Record<string, NotifyPref> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(DEPTH4_NOTIFY_PREFS_SESSION_KEY);
    const j = raw ? (JSON.parse(raw) as unknown) : null;
    if (!j || typeof j !== "object") return {};
    const out: Record<string, NotifyPref> = {};
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      if (v === "any" || v === "major" || v === "consequence" || v === "mute") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeNotifyPrefsSession(next: Record<string, NotifyPref>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DEPTH4_NOTIFY_PREFS_SESSION_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function readOutcomesSession(): Record<string, ManualThesisOutcome> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(DEPTH4_THESIS_OUTCOMES_SESSION_KEY);
    const j = raw ? (JSON.parse(raw) as unknown) : null;
    if (!j || typeof j !== "object") return {};
    const out: Record<string, ManualThesisOutcome> = {};
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      if (o.status !== "resolved" && o.status !== "invalidated") continue;
      if (typeof o.at !== "string") continue;
      out[k] = { status: o.status, at: o.at };
    }
    return out;
  } catch {
    return {};
  }
}

function writeOutcomesSession(next: Record<string, ManualThesisOutcome>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DEPTH4_THESIS_OUTCOMES_SESSION_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(DEPTH4_THESIS_OUTCOMES_CHANGED_EVENT));
  } catch {
    // ignore
  }
}

function isNotifyPref(x: unknown): x is NotifyPref {
  return x === "any" || x === "major" || x === "consequence" || x === "mute";
}

export type Depth4AccountHydrationSnapshot = {
  starred: Set<string>;
  notifyPrefs: Record<string, NotifyPref>;
  /** Account-backed thesis bell read/dismiss flags (stable alert ids). */
  alertState: Record<string, Depth4AlertPersistedState>;
};

/** Run once per successful session — merges legacy session cache into Supabase, then refreshes caches from account. */
export async function hydrateDepth4AccountState(sb: SupabaseClient): Promise<Depth4AccountHydrationSnapshot> {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return { starred: readStarredSession(), notifyPrefs: readNotifyPrefsSession(), alertState: {} };
  }

  const { data: sess } = await sb.auth.getSession();
  const tok = sess.session?.access_token ?? "";

  // --- Starred theses (thesis_stars + legacy session merge) ---
  const { data: starRows } = await sb.from("thesis_stars").select("thesis_id").eq("user_id", user.id).limit(5000);
  const fromDb = new Set((starRows ?? []).map((r) => String((r as { thesis_id?: unknown }).thesis_id ?? "").trim()).filter(Boolean));
  const fromSession = readStarredSession();
  const mergedStars = new Set<string>([...Array.from(fromDb), ...Array.from(fromSession)]);
  for (const tid of Array.from(fromSession)) {
    if (!fromDb.has(tid)) {
      await sb.from("thesis_stars").upsert({ user_id: user.id, thesis_id: tid }, { onConflict: "user_id,thesis_id" });
    }
  }
  writeStarredSession(mergedStars);

  // --- Book positions (depth4_user_book) ---
  if (tok) {
    const bookRes = await fetch("/api/user/book-positions", {
      credentials: "include",
      headers: { authorization: `Bearer ${tok}` },
    });
    const bookJson = (await bookRes.json().catch(() => null)) as { ok?: boolean; positions?: unknown } | null;
    const serverPositions = Array.isArray(bookJson?.positions) ? bookJson!.positions : [];
    const local = loadPositions();
    if (serverPositions.length > 0) {
      savePositions(serverPositions as Position[], { skipRemote: true });
    } else if (local.length > 0) {
      await fetch("/api/user/book-positions", {
        method: "PATCH",
        credentials: "include",
        headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ positions: local }),
      });
    }
  }

  let alertState: Record<string, Depth4AlertPersistedState> = {};
  if (tok) {
    const alertRes = await fetch("/api/user/alert-state", {
      credentials: "include",
      headers: { authorization: `Bearer ${tok}` },
    });
    const alertJson = (await alertRes.json().catch(() => null)) as { ok?: boolean; entries?: unknown } | null;
    if (alertJson?.ok) alertState = parseDepth4AlertStateApiEntries(alertJson.entries);
  }

  // --- User-owned theses (public.theses) ---
  if (tok) {
    const listRes = await fetch("/api/user/theses?list=1", {
      credentials: "include",
      headers: { authorization: `Bearer ${tok}` },
    });
    const listJson = (await listRes.json().catch(() => null)) as { ok?: boolean; theses?: unknown } | null;
    const rows = Array.isArray(listJson?.theses) ? listJson!.theses : [];
    const fromServer: Thesis[] = [];
    for (const r of rows) {
      if (!r || typeof r !== "object") continue;
      const o = r as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : "";
      const slug = typeof o.slug === "string" ? o.slug : "";
      const title = typeof o.title === "string" ? o.title : "";
      const status = typeof o.status === "string" ? o.status : "watching";
      if (!id || !slug) continue;
      fromServer.push(
        userThesisFromSupabaseRow({
          id,
          slug,
          title,
          micro_label: typeof o.micro_label === "string" ? o.micro_label : null,
          body: o.body,
          scenario_probabilities: o.scenario_probabilities,
          status,
          insider_flow: o.insider_flow,
          updated_at: typeof o.updated_at === "string" ? o.updated_at : null,
        }),
      );
    }
    const localTheses = loadUserTheses();
    const serverIds = new Set(fromServer.map((t) => t.id));
    const mergedTheses = [...fromServer, ...localTheses.filter((t) => !serverIds.has(t.id))];
    saveUserTheses(mergedTheses);
  }

  // --- Notify prefs + manual outcomes (users.notification_preferences) ---
  const { data: urow } = await sb.from("users").select("notification_preferences").eq("id", user.id).maybeSingle();
  const npRaw = (urow as { notification_preferences?: unknown } | null)?.notification_preferences;
  const np = npRaw && typeof npRaw === "object" && !Array.isArray(npRaw) ? (npRaw as Record<string, unknown>) : {};
  const serverNotify = np.depth4ThesisNotifyPrefs;
  const serverOutcomes = np.depth4ManualThesisOutcomes;

  const localNotify = readNotifyPrefsSession();
  const mergedNotify: Record<string, NotifyPref> = { ...localNotify };
  if (serverNotify && typeof serverNotify === "object" && !Array.isArray(serverNotify)) {
    for (const [k, v] of Object.entries(serverNotify as Record<string, unknown>)) {
      if (isNotifyPref(v)) mergedNotify[k] = v;
    }
  }
  writeNotifyPrefsSession(mergedNotify);

  const localOutcomes = readOutcomesSession();
  const mergedOutcomes: Record<string, ManualThesisOutcome> = { ...localOutcomes };
  if (serverOutcomes && typeof serverOutcomes === "object" && !Array.isArray(serverOutcomes)) {
    for (const [k, v] of Object.entries(serverOutcomes as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      if (o.status !== "resolved" && o.status !== "invalidated") continue;
      if (typeof o.at !== "string") continue;
      mergedOutcomes[k] = { status: o.status, at: o.at };
    }
  }
  writeOutcomesSession(mergedOutcomes);

  schedulePersistDepth4AccountPrefsDebounced();
  schedulePersistBookPositionsDebounced();

  /** Best-effort: flush in-memory failed alert-state PATCH queue (no browser queue). */
  await flushPendingDepth4AlertStates();

  return { starred: mergedStars, notifyPrefs: mergedNotify, alertState };
}
