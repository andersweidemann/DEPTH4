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

  const { error } = await sb
    .from("user_hidden_theses")
    .delete()
    .eq("user_id", user.id)
    .eq("thesis_id", bundle.thesis.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, hidden: false, thesisId: bundle.thesis.id });
}
