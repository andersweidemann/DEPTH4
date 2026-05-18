import { NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import { requireThesisForSlug } from "@/lib/thesis-engine-v2/thesis-api-route-helpers";
import { invalidateThesis, resolveThesis } from "@/lib/thesis/thesis-outcome-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Legacy book resolve — persists to `thesis_outcomes` (replaces session cookie). */
export async function POST(req: Request) {
  const authed = await getAuthedSupabase(req);
  if (!authed) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const thesisSlug = typeof o.thesisSlug === "string" ? o.thesisSlug.trim() : "";
  const outcome = o.outcome;
  if (!thesisSlug) return NextResponse.json({ ok: false, error: "thesis_slug_required" }, { status: 400 });
  if (outcome !== "resolved" && outcome !== "invalidated") {
    return NextResponse.json({ ok: false, error: "invalid_outcome" }, { status: 400 });
  }

  const loaded = await requireThesisForSlug(authed.sb, thesisSlug, authed.user.id);
  if (!loaded) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  try {
    if (outcome === "invalidated") {
      await invalidateThesis(authed.sb, loaded.thesis, thesisSlug, "Marked invalidated from book");
    } else {
      await resolveThesis(authed.sb, loaded.thesis, thesisSlug, {
        outcome: "won_messy",
        catalyst: "Marked resolved from book",
        resolvedBy: "manual",
      });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "resolve_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
