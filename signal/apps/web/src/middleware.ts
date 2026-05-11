import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { normalizeSupabaseAnonKey, normalizeSupabaseUrl } from "@/lib/supabase/env";
import { isDepth4PublicReadMode } from "@/lib/depth4-public-read-mode";

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
  "/auth/callback",
  /** SSR logout handler — must stay public; route redirects to same-origin `/` (marketing home) unless overridden. */
  "/auth/sign-out",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)));
}

const LEGACY_REDIRECTS = ["/dashboard", "/onboarding", "/demo"] as const;

/** Case-insensitive: avoids missing cron if the edge path ever differs in casing. */
function isCronApiPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return p === "/api/cron" || p.startsWith("/api/cron/");
}

/** Ops routes stay login-gated even when public read mode is on. */
function isAdminProtectedPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return p.startsWith("/admin") || p.startsWith("/api/admin");
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // (1) Cron API — MUST run before any session / Supabase logic (no 302 to /login).
  if (isCronApiPath(pathname)) {
    console.info("[middleware] cron route: skip session auth", { pathname, method: req.method });
    return NextResponse.next();
  }

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

  const lower = pathname.toLowerCase();
  for (const prefix of LEGACY_REDIRECTS) {
    if (lower === prefix || lower.startsWith(`${prefix}/`)) {
      const u = req.nextUrl.clone();
      u.pathname = "/theses";
      u.search = "";
      return NextResponse.redirect(u);
    }
  }

  if (isPublicPath(pathname)) return NextResponse.next();

  if (isDepth4PublicReadMode() && !isAdminProtectedPath(pathname)) {
    return NextResponse.next();
  }

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

  return res;
}

/**
 * Include `/api/cron` explicitly so cron always invokes middleware on all Next/Vercel builds.
 * Second pattern keeps the existing auth gate for pages + other `/api/*` routes.
 */
export const config = {
  matcher: ["/api/cron", "/api/cron/:path*", "/((?!_next/static|_next/image|sw.js).*)"],
};
