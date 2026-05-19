import { NextResponse } from "next/server";
import { requireDepth4Admin } from "@/lib/depth4-admin-auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";
import { loadQualityGateContext } from "@/lib/thesis/load-quality-gate-context";
import { qualityChecksToJson, runQualityGate } from "@/lib/thesis/quality-gate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST — recompute quality_score / quality_checks for all theses (admin). */
export async function POST() {
  const auth = await requireDepth4Admin();
  if ("response" in auth) return auth.response;

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
  }

  const { data: rows, error } = await admin.from("theses").select("id, status").limit(500);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let updated = 0;
  const samples: Array<{ id: string; score: number; status: string }> = [];

  for (const row of rows ?? []) {
    const id = (row as { id: string }).id;
    const ctx = await loadQualityGateContext(admin, id);
    if (!ctx) continue;

    const report = runQualityGate(ctx.input, ctx.cluster, ctx.peers);
    const { error: upErr } = await admin
      .from("theses")
      .update({
        quality_score: report.score,
        quality_checks: qualityChecksToJson(report.checks),
        promotion_blocked_reason: report.blockers.length > 0 ? report.blockers.join(", ") : null,
      })
      .eq("id", id);

    if (!upErr) {
      updated += 1;
      if (samples.length < 12) {
        samples.push({ id, score: report.score, status: (row as { status: string }).status });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: rows?.length ?? 0,
    updated,
    samples,
    ranAt: new Date().toISOString(),
  });
}
