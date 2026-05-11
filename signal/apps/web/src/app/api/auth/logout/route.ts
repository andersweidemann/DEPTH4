import { NextResponse } from "next/server";
import {
  isLikelySupabaseJwtAnonKey,
  normalizeSupabaseAnonKey,
  normalizeSupabaseUrl,
} from "@/lib/supabase/env";
import { createServerClient } from "@supabase/ssr";
import type { SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKey = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const res = NextResponse.json({ success: true });

  if (!supabaseUrl || !supabaseKey || !isLikelySupabaseJwtAnonKey(supabaseKey)) {
    return res;
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

  await s.auth.signOut();
  return res;
}
