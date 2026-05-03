import { safeAppPath } from "@/lib/app-paths";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const u = new URL(request.url);
  const code = u.searchParams.get("code");
  const n = safeAppPath(u.searchParams.get("next") || "/dashboard");
  const redirectUrl = new URL(n, request.url);

  const res = NextResponse.redirect(redirectUrl);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const jar = await cookies();
  const s = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          res.cookies.set({ name, value, ...(options as CookieOptions) });
        }
      },
    },
  });

  if (code) {
    const { error } = await s.auth.exchangeCodeForSession(code);
    if (error) {
      const q = new URLSearchParams({ error: error.message });
      return NextResponse.redirect(new URL(`/login?${q.toString()}`, request.url));
    }
  }

  return res;
}
