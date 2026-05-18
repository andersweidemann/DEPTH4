import { NextRequest, NextResponse } from "next/server";
import { isDepth4ElevatedUser } from "@/lib/depth4-elevated-access";
import { createClient } from "@/lib/supabase/server";
import {
  fetchReaderAnalyticsDaily,
  fetchReaderAnalyticsReport,
} from "@/lib/thesis-engine-v2/thesis-reader-analytics/report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !isDepth4ElevatedUser({ userId: user.id, email: user.email })) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? "30") || 30));
  const slug = req.nextUrl.searchParams.get("slug")?.trim() ?? "";

  const report = await fetchReaderAnalyticsReport(days);
  const daily = slug ? await fetchReaderAnalyticsDaily(slug, days) : [];

  return NextResponse.json({
    ok: true,
    since: report.since,
    days,
    writeFailures: report.writeFailures,
    theses: report.theses,
    daily,
  });
}
