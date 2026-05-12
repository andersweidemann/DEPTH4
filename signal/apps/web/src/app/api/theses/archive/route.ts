import { NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import { buildThesesArchiveListResponse } from "@/lib/theses/theses-archive-list";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const payload = await buildThesesArchiveListResponse(auth.sb, auth.user.id);
  return NextResponse.json(payload);
}
