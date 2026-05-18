import { NextResponse } from "next/server";
import { buildBookApiPayload } from "@/lib/book/book-api-response";
import { requireSupabaseUser } from "@/lib/auth/supabase-route-client";
import { fetchBookResolvedTheses } from "@/lib/thesis/thesis-outcome-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireSupabaseUser(req);
  if (!auth.ok) return auth.response;

  const resolvedTheses = await fetchBookResolvedTheses(auth.supabase);
  const payload = await buildBookApiPayload(auth.supabase, auth.user.id, resolvedTheses);
  return NextResponse.json(payload);
}
