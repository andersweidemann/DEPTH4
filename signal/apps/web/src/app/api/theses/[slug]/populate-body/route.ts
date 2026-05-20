import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import { populateUserThesisBody, shouldAutoPopulateUserThesisBody } from "@/lib/thesis/populate-user-thesis-body";
import { fetchThesisRowBySlug } from "@/lib/thesis-engine-v2/fetch-thesis-row-by-slug";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shellThesisFromRow(row: {
  id: string;
  slug: string;
  title: string;
  body?: unknown;
}): Thesis {
  return mergeDbBodyIntoThesis(
    {
      id: row.id,
      slug: row.slug,
      title: row.title,
      thesisStatement: row.title,
      asset: "—",
      direction: "watch",
      probability: 50,
      status: "forming",
      probabilityRationale: "",
      hiddenDriver: "",
      likelyPath: "",
      marketMisread: "",
      tradeExpression: "",
      whyNow: "",
      whatsUnpriced: "",
      trigger: "",
      trade: "",
      invalidation: "",
      horizon: "weeks",
      advisoryAction: "watch",
      lastUpdated: "",
      qualification: "emerging",
      scores: {
        driverStrength: 10,
        timeCompression: 10,
        marketMispricingScore: 10,
        tradeClarityScore: 8,
        triggerClarityScore: 8,
        total: 46,
      },
      theme: "macro",
    },
    row.body ?? null,
  );
}

export async function POST(req: Request, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });

  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const row = await fetchThesisRowBySlug(auth.sb, slug, auth.user.id);
  if (!row || row.thesis_origin !== "user" || row.owner_user_id !== auth.user.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
  }

  const thesis = shellThesisFromRow(row);
  const assetSymbol = thesis.asset?.split(/[\s—–-]/)[0]?.trim() || row.title;
  const populated = await populateUserThesisBody(admin, row.id, {
    title: row.title,
    assetSymbol,
    direction: thesis.direction,
    timeHorizon: thesis.horizon || "weeks",
  });

  return NextResponse.json({
    ok: true,
    populated,
    stillNeedsPopulate: !populated && shouldAutoPopulateUserThesisBody(row.body),
  });
}
