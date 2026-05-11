import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { authFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

export type PutUserThesisResult = { ok: true } | { ok: false; error: string; status?: number };

export async function putUserThesisToSupabase(thesis: Thesis): Promise<PutUserThesisResult> {
  const sb = createClient();
  const { data: sessionData } = await sb.auth.getSession();
  const tok = sessionData.session?.access_token;
  if (!tok) return { ok: false, error: "sign_in_required" };

  const r = await authFetch("/api/user/theses", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ thesis }),
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
}
