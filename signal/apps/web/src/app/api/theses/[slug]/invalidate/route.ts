import { NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import { requireThesisForSlug } from "@/lib/thesis-engine-v2/thesis-api-route-helpers";
import { invalidateThesis } from "@/lib/thesis/thesis-outcome-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });

  const authed = await getAuthedSupabase(req);
  if (!authed) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const catalyst = typeof o.catalyst === "string" ? o.catalyst.trim() : "";
  if (!catalyst) {
    return NextResponse.json({ ok: false, error: "catalyst_required" }, { status: 400 });
  }

  const loaded = await requireThesisForSlug(authed.sb, slug, authed.user.id);
  if (!loaded) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const terminal = new Set(["resolved", "invalidated", "archived"]);
  if (terminal.has(loaded.thesis.status)) {
    return NextResponse.json({ ok: false, error: "already_terminal" }, { status: 409 });
  }

  try {
    const record = await invalidateThesis(authed.sb, loaded.thesis, slug, catalyst);
    return NextResponse.json({ ok: true, outcome: record });
  } catch (e) {
    const message = e instanceof Error ? e.message : "invalidate_failed";
    console.error("[api/theses/invalidate]", message, e);
    return NextResponse.json({ ok: false, error: "invalidate_failed", message }, { status: 500 });
  }
}
