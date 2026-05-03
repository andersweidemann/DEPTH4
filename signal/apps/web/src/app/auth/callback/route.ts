import { safeAppPath } from "@/lib/app-paths";
import {
  isLikelySupabaseJwtAnonKey,
  normalizeSupabaseAnonKey,
  normalizeSupabaseUrl,
  safeAuthErrorForQuery,
} from "@/lib/supabase/env";
import { createServerClient } from "@supabase/ssr";
import type { SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const u = new URL(request.url);
  const code = u.searchParams.get("code");
  const n = safeAppPath(u.searchParams.get("next") || "/dashboard");
  const redirectUrl = new URL(n, request.url);

  const res = NextResponse.redirect(redirectUrl);

  const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKey = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!supabaseUrl || !supabaseKey || !isLikelySupabaseJwtAnonKey(supabaseKey)) {
    const q = new URLSearchParams({
      error:
        "Supabase env vars look invalid. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (no Bearer prefix, no quotes).",
    });
    return NextResponse.redirect(new URL(`/login?${q.toString()}`, request.url));
  }

  const jar = await cookies();
  const s = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll: ((cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          res.cookies.set({ name, value, ...options });
        }
      }) satisfies SetAllCookies,
    },
  });

  if (code) {
    try {
      const { error } = await s.auth.exchangeCodeForSession(code);
      if (error) {
        const q = new URLSearchParams({ error: safeAuthErrorForQuery(error.message) });
        return NextResponse.redirect(new URL(`/login?${q.toString()}`, request.url));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "exchangeCodeForSession failed";
      const q = new URLSearchParams({ error: safeAuthErrorForQuery(msg) });
      return NextResponse.redirect(new URL(`/login?${q.toString()}`, request.url));
    }
  }

  return res;
}
