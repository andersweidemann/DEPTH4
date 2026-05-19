import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import { runQualityGateForThesisId } from "@/lib/thesis/load-quality-gate-context";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  const auth = await getAuthedSupabase(req);
  const sb = auth?.sb ?? createServiceRoleClient();
  if (!sb) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: row } = await sb.from("theses").select("id").eq("slug", slug).maybeSingle();
  const byId = row
    ? row
    : (
        await sb
          .from("theses")
          .select("id")
          .eq("id", slug)
          .maybeSingle()
      ).data;

  const thesisId = byId && typeof (byId as { id?: unknown }).id === "string" ? (byId as { id: string }).id : null;
  if (!thesisId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const report = await runQualityGateForThesisId(sb, thesisId);
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ slug, thesisId, ...report });
}
