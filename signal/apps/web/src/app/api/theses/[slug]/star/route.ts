import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import { loadThesisDetailBundleForApi } from "@/lib/thesis-engine-v2/load-thesis-api-bundle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sb, user } = auth;

  const bundle = await loadThesisDetailBundleForApi(sb, slug, user.id);
  if (!bundle) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const thesisId = bundle.thesis.id;
  const { data: existing } = await sb
    .from("thesis_stars")
    .select("thesis_id")
    .eq("user_id", user.id)
    .eq("thesis_id", thesisId)
    .maybeSingle();

  if (existing) {
    const { error: delErr } = await sb.from("thesis_stars").delete().eq("user_id", user.id).eq("thesis_id", thesisId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });
    return NextResponse.json({ starred: false });
  }

  const { error: insErr } = await sb.from("thesis_stars").insert({ user_id: user.id, thesis_id: thesisId });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
  return NextResponse.json({ starred: true });
}
