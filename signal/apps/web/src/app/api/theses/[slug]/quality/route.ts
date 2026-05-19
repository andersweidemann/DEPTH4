import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import { runQualityGateForThesisId } from "@/lib/thesis/load-quality-gate-context";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";
import type { QualityCheckResult, QualityReport } from "@/lib/thesis/quality-gate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function checksFromDbJson(raw: unknown, fallback: QualityCheckResult[]): QualityCheckResult[] {
  if (!Array.isArray(raw)) return fallback;
  const parsed: QualityCheckResult[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const name = (row as { name?: unknown }).name;
    const passed = (row as { passed?: unknown }).passed;
    if (typeof name !== "string") continue;
    parsed.push({
      name,
      passed: passed === true,
      message: passed === true ? `${name} passed` : `${name} needs attention`,
    });
  }
  return parsed.length ? parsed : fallback;
}

function mergePersistedQuality(
  report: QualityReport,
  row: {
    quality_score?: number | null;
    quality_checks?: unknown;
    promotion_blocked_reason?: string | null;
    thesis_origin?: string | null;
  },
): QualityReport {
  const dbScore = row.quality_score;
  if (dbScore == null || !Number.isFinite(Number(dbScore)) || Number(dbScore) <= 0) {
    return report;
  }
  const score = Math.min(100, Math.max(0, Math.round(Number(dbScore))));
  const checks = checksFromDbJson(row.quality_checks, report.checks);
  const blockers = row.promotion_blocked_reason?.trim()
    ? row.promotion_blocked_reason.split(",").map((s) => s.trim()).filter(Boolean)
    : report.blockers;
  return {
    ...report,
    score,
    checks,
    blockers,
    canPromote: blockers.length === 0 && score >= 65,
    promotionTarget: score >= 65 ? "ready" : score >= 45 ? "active" : "watch",
  };
}

export async function GET(req: NextRequest, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  const auth = await getAuthedSupabase(req);
  const sb = auth?.sb ?? createServiceRoleClient();
  if (!sb) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: row } = await sb
    .from("theses")
    .select("id, quality_score, quality_checks, promotion_blocked_reason, thesis_origin")
    .eq("slug", slug)
    .maybeSingle();
  const byId = row
    ? row
    : (
        await sb
          .from("theses")
          .select("id, quality_score, quality_checks, promotion_blocked_reason, thesis_origin")
          .eq("id", slug)
          .maybeSingle()
      ).data;

  const thesisId = byId && typeof (byId as { id?: unknown }).id === "string" ? (byId as { id: string }).id : null;
  if (!thesisId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const report = await runQualityGateForThesisId(sb, thesisId);
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const merged = mergePersistedQuality(report, byId as Parameters<typeof mergePersistedQuality>[1]);

  return NextResponse.json({ slug, thesisId, ...merged });
}
