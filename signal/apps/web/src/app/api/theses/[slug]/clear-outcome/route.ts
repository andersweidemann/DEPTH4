import { NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import { requireThesisForSlug } from "@/lib/thesis-engine-v2/thesis-api-route-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Remove formal outcome record and reopen thesis for tracking (auth required). */
export async function POST(_req: Request, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });

  const authed = await getAuthedSupabase(_req);
  if (!authed) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const loaded = await requireThesisForSlug(authed.sb, slug, authed.user.id);
  if (!loaded) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const { error: delErr } = await authed.sb.from("thesis_outcomes").delete().eq("thesis_slug", slug);
  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  }

  const { error: upErr } = await authed.sb
    .from("theses")
    .update({
      status: "active",
      outcome: null,
      lifecycle_state: "live",
      resolved_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", loaded.thesis.id);

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
