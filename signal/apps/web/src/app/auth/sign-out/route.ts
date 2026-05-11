import { authPostSignOutUrl } from "@/lib/auth/sign-out-landing";
import {
  isLikelySupabaseJwtAnonKey,
  normalizeSupabaseAnonKey,
  normalizeSupabaseUrl,
} from "@/lib/supabase/env";
import { createServerClient } from "@supabase/ssr";
import type { SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/** Ends the Supabase session and clears auth cookies. POST only (avoid logout CSRF via GET). */
export async function POST(request: Request) {
  const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKey = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const welcome = authPostSignOutUrl(request.url);

  if (!supabaseUrl || !supabaseKey || !isLikelySupabaseJwtAnonKey(supabaseKey)) {
    return NextResponse.redirect(welcome);
  }

  const res = NextResponse.redirect(welcome);
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

  await s.auth.signOut();
  return res;
}
