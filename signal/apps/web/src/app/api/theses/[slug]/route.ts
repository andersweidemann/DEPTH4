import { NextRequest, NextResponse } from "next/server";
import { loadApiThesisPayload } from "@/lib/thesis-engine-v2/thesis-api-route-helpers";
import { getSupabaseAndUserIdForThesisDetailApi } from "@/lib/thesis-engine-v2/thesis-detail-api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  const { supabase, userId } = await getSupabaseAndUserIdForThesisDetailApi(req);

  const payload = await loadApiThesisPayload(supabase, slug, userId);
  if (!payload) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(payload.apiThesis);
}
