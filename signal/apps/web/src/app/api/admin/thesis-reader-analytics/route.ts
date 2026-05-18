import { NextRequest, NextResponse } from "next/server";
import { isDepth4ElevatedUser } from "@/lib/depth4-elevated-access";
import { createClient } from "@/lib/supabase/server";
import {
  fetchReaderAnalyticsDaily,
  fetchReaderAnalyticsReport,
} from "@/lib/thesis-engine-v2/thesis-reader-analytics/report";
import type { ReaderAnalyticsSort } from "@/lib/thesis-engine-v2/thesis-reader-analytics/report-query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseSort(raw: string | null): ReaderAnalyticsSort {
  if (raw === "lastViewed" || raw === "recent" || raw === "humanViews") return raw;
  return "humanViews";
}

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
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const sort = parseSort(req.nextUrl.searchParams.get("sort"));

  const report = await fetchReaderAnalyticsReport({ days, q, sort });
  const daily = slug ? await fetchReaderAnalyticsDaily(slug, days) : [];

  return NextResponse.json({
    ok: true,
    since: report.since,
    sinceDate: report.sinceDate,
    days,
    sort,
    q,
    writeFailures: report.writeFailures,
    health: report.health,
    retention: report.retention,
    theses: report.theses,
    daily,
  });
}
