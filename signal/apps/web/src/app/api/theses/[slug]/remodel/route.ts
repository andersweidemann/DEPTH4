import { NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";
import { requireThesisForSlug } from "@/lib/thesis-engine-v2/thesis-api-route-helpers";
import { remodelThesisScenarios } from "@/lib/thesis/remodel-scenarios";
import { isDepth4PublicReadMode } from "@/lib/depth4-public-read-mode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });

  const authed = await getAuthedSupabase(req);
  const service = createServiceRoleClient();

  if (!service) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
  }

  if (authed) {
    const loaded = await requireThesisForSlug(authed.sb, slug, authed.user.id);
    if (!loaded) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  } else if (!isDepth4PublicReadMode()) {
    const cronHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    const secret = (process.env.CRON_SECRET ?? "").trim();
    if (!secret || cronHeader !== secret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await remodelThesisScenarios(service, slug, { triggerReason: "manual" });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "remodel_failed";
    console.error("[api/theses/remodel]", message, e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
