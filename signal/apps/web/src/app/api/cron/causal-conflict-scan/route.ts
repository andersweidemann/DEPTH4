import { type NextRequest, NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/cron-auth";
import { scanForContradictions } from "@/lib/causal-graph/conflict-scanner";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export const runtime = "nodejs";

/**
 * Daily causal graph audit — surfaces same-asset direction clashes and semantic mismatches.
 * Schedule: Vercel Cron `0 5 * * *` → GET /api/cron/causal-conflict-scan
 */
export async function GET(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
  }

  const reports = await scanForContradictions(admin);
  const critical = reports.filter((r) => r.severity === "critical");

  if (critical.length > 0) {
    console.error("[causal-conflict-scan] critical contradictions", {
      count: critical.length,
      sample: critical.slice(0, 5),
    });
  }

  return NextResponse.json({
    ok: true,
    scannedAt: new Date().toISOString(),
    total: reports.length,
    criticalCount: critical.length,
    reports,
  });
}
