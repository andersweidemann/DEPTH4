import { safeAppPath } from "@/lib/app-paths";
import { NextResponse } from "next/server";

/** Thin alias so `/api/auth/callback` can mirror Supabase redirect configuration if needed. */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const qs = u.searchParams.toString();
  const target = new URL("/auth/callback", request.url);
  if (qs) target.search = qs;
  const n = safeAppPath(target.searchParams.get("next") || "/theses");
  target.searchParams.set("next", n);
  return NextResponse.redirect(target);
}
