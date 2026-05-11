/**
 * Write-through PATCH for `public.depth4_user_alert_state` (account source of truth).
 * Bounded retry (one replay after short backoff) + tiny in-memory pending map — never browser storage.
 */
import { createClient } from "@/lib/supabase/client";
import type { Depth4AlertPersistedState } from "@/lib/thesis-engine-v2/depth4-alert-state-utils";

export type Depth4AlertPersistAction = "dismiss" | "markReadOnOpen" | "markAllRead";

const RETRY_BACKOFF_MS = 450;
const PENDING_KEY_CAP = 48;

let lastPendingAction: Depth4AlertPersistAction | undefined;
const pendingByKey = new Map<string, Depth4AlertPersistedState>();

function dedupeEntries(entries: { alert_key: string; state: Depth4AlertPersistedState }[]): {
  alert_key: string;
  state: Depth4AlertPersistedState;
}[] {
  const m = new Map<string, Depth4AlertPersistedState>();
  for (const e of entries) {
    const k = e.alert_key.trim();
    if (!k) continue;
    m.set(k, e.state);
  }
  return Array.from(m.entries()).map(([alert_key, state]) => ({ alert_key, state }));
}

function trimPendingMap(): void {
  while (pendingByKey.size > PENDING_KEY_CAP) {
    const first = pendingByKey.keys().next().value;
    if (first === undefined) break;
    pendingByKey.delete(first);
  }
}

function shouldRetryHttpStatus(status: number): boolean {
  return status === 0 || status >= 500 || status === 429 || status === 408;
}

/** Privacy-safe: counts, HTTP code, action path — no thesis text or alert copy. */
function logAlertStateWriteFailure(meta: {
  signedIn: boolean;
  entryCount: number;
  action: string;
  finalAttempt: 1 | 2;
  httpStatus: number;
  errorKind: "http" | "network";
}): void {
  console.warn(JSON.stringify({ t: "depth4_alert_state_write_failed", ...meta }));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function patchAlertStateOnce(
  tok: string,
  entries: { alert_key: string; state: Depth4AlertPersistedState }[],
): Promise<{ ok: boolean; status: number; errorKind: "http" | "network" }> {
  try {
    const res = await fetch("/api/user/alert-state", {
      method: "PATCH",
      credentials: "include",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    return { ok: res.ok, status: res.status, errorKind: "http" };
  } catch {
    return { ok: false, status: 0, errorKind: "network" };
  }
}

type PatchOutcome = "ok" | "queue" | "drop";

async function patchWithBoundedRetry(
  tok: string,
  entries: { alert_key: string; state: Depth4AlertPersistedState }[],
  action: string,
  signedIn: boolean,
): Promise<PatchOutcome> {
  const first = await patchAlertStateOnce(tok, entries);
  if (first.ok) return "ok";

  if (shouldRetryHttpStatus(first.status)) {
    await sleep(RETRY_BACKOFF_MS);
    const second = await patchAlertStateOnce(tok, entries);
    if (second.ok) return "ok";
    logAlertStateWriteFailure({
      signedIn,
      entryCount: entries.length,
      action,
      finalAttempt: 2,
      httpStatus: second.status,
      errorKind: second.errorKind,
    });
    return "queue";
  }

  logAlertStateWriteFailure({
    signedIn,
    entryCount: entries.length,
    action,
    finalAttempt: 1,
    httpStatus: first.status,
    errorKind: first.errorKind,
  });
  return "drop";
}

function mergePendingWithNew(
  newEntries: { alert_key: string; state: Depth4AlertPersistedState }[],
): { alert_key: string; state: Depth4AlertPersistedState }[] {
  const m = new Map<string, Depth4AlertPersistedState>();
  for (const [k, st] of Array.from(pendingByKey.entries())) m.set(k, st);
  for (const e of newEntries) m.set(e.alert_key.trim(), e.state);
  return dedupeEntries(Array.from(m.entries()).map(([alert_key, state]) => ({ alert_key, state })));
}

function enqueuePending(
  entries: { alert_key: string; state: Depth4AlertPersistedState }[],
  action: Depth4AlertPersistAction | undefined,
): void {
  for (const e of entries) pendingByKey.set(e.alert_key.trim(), e.state);
  if (action) lastPendingAction = action;
  trimPendingMap();
}

export async function flushPendingDepth4AlertStates(): Promise<void> {
  await persistDepth4AlertStates([]);
}

export type PersistDepth4AlertStatesOptions = {
  action?: Depth4AlertPersistAction;
};

export async function persistDepth4AlertStates(
  entries: { alert_key: string; state: Depth4AlertPersistedState }[],
  opts?: PersistDepth4AlertStatesOptions,
): Promise<void> {
  try {
    const sb = createClient();
    const { data: sess } = await sb.auth.getSession();
    const tok = sess.session?.access_token;
    if (!tok) return;

    const signedIn = true;
    const incoming = dedupeEntries(entries);
    const fromPending = dedupeEntries(
      Array.from(pendingByKey.entries()).map(([alert_key, state]) => ({ alert_key, state })),
    );
    const combined =
      incoming.length > 0 ? mergePendingWithNew(incoming) : fromPending.length > 0 ? fromPending : [];
    if (combined.length === 0) return;

    const actionLabel =
      incoming.length > 0 ? opts?.action ?? lastPendingAction ?? "unknown" : lastPendingAction ?? "pending_flush";

    const outcome = await patchWithBoundedRetry(tok, combined, actionLabel, signedIn);

    if (outcome === "ok") {
      pendingByKey.clear();
      lastPendingAction = undefined;
      return;
    }
    if (outcome === "queue") {
      enqueuePending(combined, opts?.action ?? lastPendingAction);
    }
  } catch {
    // leave pending for a later flush
  }
}

/** Test-only reset of in-memory queue (Vitest). */
export function resetDepth4AlertStatePersistForTests(): void {
  if (process.env.NODE_ENV === "test") {
    pendingByKey.clear();
    lastPendingAction = undefined;
  }
}
