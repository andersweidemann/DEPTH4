import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isLikelySupabaseJwtAnonKey, normalizeSupabaseAnonKey, normalizeSupabaseUrl } from "@/lib/supabase/env";

export async function middleware(request: NextRequest) {
  const u = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const k = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!u || !k || !isLikelySupabaseJwtAnonKey(k)) {
    return NextResponse.next();
  }
  let res = NextResponse.next({
    request: { headers: request.headers },
  });
  const supa = createServerClient(
    u,
    k,
    {
      cookies: {
        get(n: string) {
          return request.cookies.get(n)?.value;
        },
        set(n: string, v: string, o: CookieOptions) {
          request.cookies.set({ name: n, value: v, ...o });
          res = NextResponse.next({ request: { headers: request.headers } });
          res.cookies.set({ name: n, value: v, ...o });
        },
        remove(n: string, o: CookieOptions) {
          request.cookies.set({ name: n, value: "", ...o });
          res = NextResponse.next({ request: { headers: request.headers } });
          res.cookies.set({ name: n, value: "", ...o });
        },
      },
    },
  );
  const {
    data: { user },
  } = await supa.auth.getUser();
  const p = request.nextUrl.pathname;
  if (!user && (p.startsWith("/dashboard") || p.startsWith("/onboarding"))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && p === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/login"],
};
