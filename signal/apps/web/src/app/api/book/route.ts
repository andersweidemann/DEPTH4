import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildBookApiPayload } from "@/lib/book/book-api-response";
import { requireSupabaseUser } from "@/lib/auth/supabase-route-client";
import {
  parseThesisOutcomeCookie,
  THESIS_OUTCOME_COOKIE,
} from "@/lib/thesis-engine-v2/thesis-outcome-cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireSupabaseUser(req);
  if (!auth.ok) return auth.response;

  const jar = cookies();
  const outcomes = parseThesisOutcomeCookie(jar.get(THESIS_OUTCOME_COOKIE)?.value);

  const payload = await buildBookApiPayload(auth.supabase, auth.user.id, outcomes);
  return NextResponse.json(payload);
}
