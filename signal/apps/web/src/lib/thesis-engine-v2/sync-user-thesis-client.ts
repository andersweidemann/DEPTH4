import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { authFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

export type PutUserThesisResult = { ok: true } | { ok: false; error: string; status?: number };

export type PutUserThesisOptions = {
  /** Stored in `thesis_updates.reason` when updating an existing row (Phase 1.5). */
  updateReason?: string | null;
};

/** Best-effort: cache Bearer for authFetch when OAuth left only cookie session. */
async function hydrateDepth4TokenFromSupabaseSession(): Promise<void> {
  if (typeof window === "undefined") return;
  if (localStorage.getItem("depth4_token") || sessionStorage.getItem("depth4_token")) return;
  try {
    const sb = createClient();
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session?.access_token) return;
    try {
      localStorage.setItem("depth4_token", session.access_token);
    } catch {
      sessionStorage.setItem("depth4_token", session.access_token);
    }
  } catch {
    // PUT still runs with credentials: "include" when cookies carry the session
  }
}

export async function putUserThesisToSupabase(
  thesis: Thesis,
  options?: PutUserThesisOptions,
): Promise<PutUserThesisResult> {
  await hydrateDepth4TokenFromSupabaseSession();

  try {
    const r = await authFetch("/api/user/theses", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thesis,
        ...(options?.updateReason != null && options.updateReason !== ""
          ? { updateReason: options.updateReason }
          : {}),
      }),
    });

    if (r.ok) return { ok: true };

    let msg = `save_failed_${r.status}`;
    try {
      const j = (await r.json()) as { error?: unknown };
      if (typeof j?.error === "string") msg = j.error;
    } catch {
      // ignore
    }
    return { ok: false, error: msg, status: r.status };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { ok: false, error: "sign_in_required" };
    }
    throw e;
  }
}
