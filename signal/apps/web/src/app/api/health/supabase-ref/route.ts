import { NextRequest, NextResponse } from "next/server";
import { bearerToken, getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import { buildSupabaseRefHealthPayload, decodeJwtRef } from "@/lib/supabase/supabase-ref-health";
import { createClient as createCookieSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only Supabase project alignment diagnostics (no secrets). */
export async function GET(req: NextRequest) {
  let jwt_ref: string | null = null;

  const bearer = bearerToken(req);
  if (bearer) {
    jwt_ref = decodeJwtRef(bearer);
  }

  if (!jwt_ref) {
    try {
      const cookieSb = await createCookieSupabaseClient();
      const {
        data: { session },
      } = await cookieSb.auth.getSession();
      if (session?.access_token) {
        jwt_ref = decodeJwtRef(session.access_token);
      }
    } catch {
      // env-only diagnostics still useful
    }
  }

  const auth = await getAuthedSupabase(req);

  const body = buildSupabaseRefHealthPayload({
    jwt_ref,
    user_id: auth?.user.id ?? null,
    has_session: Boolean(auth),
  });

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
