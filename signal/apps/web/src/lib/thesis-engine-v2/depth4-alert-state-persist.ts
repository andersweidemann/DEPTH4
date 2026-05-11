/**
 * Write-through PATCH for `public.depth4_user_alert_state` (account source of truth).
 */
import { createClient } from "@/lib/supabase/client";
import type { Depth4AlertPersistedState } from "@/lib/thesis-engine-v2/depth4-alert-state-utils";

export async function persistDepth4AlertStates(entries: { alert_key: string; state: Depth4AlertPersistedState }[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    const sb = createClient();
    const { data: sess } = await sb.auth.getSession();
    const tok = sess.session?.access_token;
    if (!tok) return;
    await fetch("/api/user/alert-state", {
      method: "PATCH",
      credentials: "include",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify({ entries }),
    });
  } catch {
    // ignore
  }
}
