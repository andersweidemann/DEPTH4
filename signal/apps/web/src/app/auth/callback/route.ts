import { safeAppPath } from "@/lib/app-paths";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const u = new URL(request.url);
  const code = u.searchParams.get("code");
  const n = safeAppPath(u.searchParams.get("next") || "/dashboard");
  if (code) {
    const s = await createClient();
    await s.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(n, request.url));
}
