import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildBookApiPayload } from "@/lib/book/book-api-response";
import {
  parseThesisOutcomeCookie,
  THESIS_OUTCOME_COOKIE,
} from "@/lib/thesis-engine-v2/thesis-outcome-cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const jar = cookies();
  const outcomes = parseThesisOutcomeCookie(jar.get(THESIS_OUTCOME_COOKIE)?.value);

  const payload = await buildBookApiPayload(supabase, user.id, outcomes);
  return NextResponse.json(payload);
}
