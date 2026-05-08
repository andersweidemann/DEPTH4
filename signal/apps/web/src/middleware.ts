import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { isBetaEmailAllowed, betaBlockedRedirectUrl } from "@/lib/beta";
import { normalizeSupabaseAnonKey, normalizeSupabaseUrl } from "@/lib/supabase/env";

const PUBLIC_PREFIXES = [
  "/",
  "/login",
  "/signup",
  "/pricing",
  "/help",
  "/terms",
  "/privacy",
  "/risk",
  "/risk-disclosure",
  "/disclaimer",
  "/demo",
  "/auth/callback",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)));
}

export async function middleware(req: NextRequest) {
  // Skip static assets / next internals early.
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo/") ||
    pathname.startsWith("/landing/") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".json") ||
    pathname.endsWith(".txt")
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) return NextResponse.next();

  const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKey = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!supabaseUrl || !supabaseKey) return NextResponse.next();

  const res = NextResponse.next();
  const s = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        for (const { name, value, options } of cookiesToSet) {
          res.cookies.set({ name, value, ...options });
        }
      },
    },
  });

  const {
    data: { user },
  } = await s.auth.getUser();

  if (!user) {
    const u = req.nextUrl.clone();
    u.pathname = "/login";
    u.searchParams.set("next", pathname);
    return NextResponse.redirect(u);
  }

  if (!isBetaEmailAllowed(user.email)) {
    await s.auth.signOut();
    return NextResponse.redirect(betaBlockedRedirectUrl(req.nextUrl.origin, pathname));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|sw.js).*)"],
};

