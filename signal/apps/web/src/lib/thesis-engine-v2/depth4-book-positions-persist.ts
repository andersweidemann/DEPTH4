/** Debounced PATCH of session Book positions to `public.depth4_user_book`. */
import { authFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { loadPositions } from "@/lib/thesis-engine-v2/positions-store";

let bookTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePersistBookPositionsDebounced(): void {
  if (typeof window === "undefined") return;
  if (bookTimer) clearTimeout(bookTimer);
  bookTimer = setTimeout(() => {
    bookTimer = null;
    void flushBookPositions();
  }, 850);
}

/** Persist book to account immediately (e.g. open/close position). */
export async function flushBookPositionsImmediately(): Promise<void> {
  await flushBookPositions();
}

async function flushBookPositions(): Promise<void> {
  try {
    const sb = createClient();
    const { data: sess } = await sb.auth.getSession();
    const tok = sess.session?.access_token;
    if (!tok) return;
    const positions = loadPositions();
    await authFetch("/api/user/book-positions", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ positions }),
    });
  } catch {
    // ignore
  }
}
