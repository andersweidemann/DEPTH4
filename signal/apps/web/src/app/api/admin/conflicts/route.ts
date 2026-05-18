import { NextResponse } from "next/server";
import { requireDepth4Admin } from "@/lib/depth4-admin-auth";
import { scanForContradictions } from "@/lib/causal-graph/conflict-scanner";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await requireDepth4Admin();
  if ("response" in auth) return auth.response;

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
  }

  const reports = await scanForContradictions(admin);
  const critical = reports.filter((r) => r.severity === "critical");

  return NextResponse.json({
    ok: true,
    scannedAt: new Date().toISOString(),
    total: reports.length,
    criticalCount: critical.length,
    reports,
  });
}
