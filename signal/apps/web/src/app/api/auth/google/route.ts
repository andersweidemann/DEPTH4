import { safeAppPath } from "@/lib/app-paths";
import {
  isLikelySupabaseJwtAnonKey,
  normalizeSupabaseAnonKey,
  normalizeSupabaseUrl,
} from "@/lib/supabase/env";
import { createServerClient } from "@supabase/ssr";
import type { SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKey = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!supabaseUrl || !supabaseKey || !isLikelySupabaseJwtAnonKey(supabaseKey)) {
    return NextResponse.json({ message: "Auth is not configured." }, { status: 500 });
  }

  const reqUrl = new URL(request.url);
  const next = safeAppPath(reqUrl.searchParams.get("next"));
  const origin = reqUrl.origin;
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const jar = await cookies();

  const redirectResponse = NextResponse.redirect(`${origin}/`, { status: 302 });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll: ((cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          redirectResponse.cookies.set({ name, value, ...options });
        }
      }) satisfies SetAllCookies,
    },
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error || !data.url) {
    const q = new URLSearchParams({ error: error?.message ?? "oauth_failed" });
    return NextResponse.redirect(new URL(`/login?${q.toString()}`, request.url));
  }

  redirectResponse.headers.set("Location", data.url);
  return redirectResponse;
}
