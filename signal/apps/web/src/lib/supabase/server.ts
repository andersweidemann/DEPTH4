import { createServerClient } from "@supabase/ssr";
import type { SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";

import { normalizeSupabaseAnonKey, normalizeSupabaseUrl } from "@/lib/supabase/env";

/**
 * Server Supabase client for Route Handlers, Server Components, and `cookies()`-backed APIs.
 *
 * **Must** use the `getAll` / `setAll` cookie adapter (not legacy `get` / `set` / `remove`):
 * Supabase SSR splits large sessions across multiple cookies (`…auth-token.0`, `.1`, …).
 * The old per-name `get` API does not reassemble chunks, so `auth.getUser()` can return no user
 * even after a successful OAuth `exchangeCodeForSession` — `/api/auth/me` then returns `{ user: null }`
 * while middleware (already on `getAll`) still sees the session, or both paths break inconsistently.
 */
export async function createClient() {
  const store = await cookies();
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll: ((cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — session refresh is handled by middleware / Route Handlers.
        }
      }) satisfies SetAllCookies,
    },
  });
}
