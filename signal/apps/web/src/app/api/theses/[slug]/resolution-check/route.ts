import { NextResponse } from "next/server";
import { checkPriceVsTradePlan } from "@/lib/thesis/check-resolution";
import { isDepth4PublicReadMode } from "@/lib/depth4-public-read-mode";
import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import {
  assetSymbolFromThesis,
  storedTradePlanFromThesis,
} from "@/lib/thesis-engine-v2/stored-trade-plan";
import { requireThesisForSlug } from "@/lib/thesis-engine-v2/thesis-api-route-helpers";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIVE_STATUSES = new Set(["forming", "watching", "ready", "active"]);

export async function GET(req: Request, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });

  const authed = await getAuthedSupabase(req);
  if (!authed && !isDepth4PublicReadMode()) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let thesis = getThesisDetail(slug)?.thesis ?? null;
  let createdAt: string | null = null;

  if (authed) {
    const loaded = await requireThesisForSlug(authed.sb, slug, authed.user.id);
    if (!loaded) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    thesis = loaded.thesis;
    const { data } = await authed.sb
      .from("theses")
      .select("created_at")
      .eq("id", thesis.id)
      .maybeSingle();
    createdAt = (data as { created_at?: string } | null)?.created_at ?? null;
  } else if (!thesis) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (!thesis) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  if (!LIVE_STATUSES.has(thesis.status)) {
    return NextResponse.json({ ok: true, check: null, reason: "terminal_status" });
  }

  const assetSymbol = assetSymbolFromThesis(thesis);
  const result = await checkPriceVsTradePlan({
    assetSymbol,
    direction: thesis.direction,
    horizon: thesis.horizon,
    createdAt: createdAt ?? thesis.lastUpdated ?? null,
    tradePlan: storedTradePlanFromThesis(thesis),
  });

  return NextResponse.json({
    ok: true,
    check: result,
    assetSymbol,
  });
}
