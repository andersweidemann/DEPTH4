import { type NextRequest, NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/cron-auth";
import { runReaderAnalyticsRetention } from "@/lib/thesis-engine-v2/thesis-reader-analytics/retention";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rolls up raw public reader events older than retention window, then deletes them.
 * Schedule: daily via Vercel cron (`vercel.json`) or external hit with CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runRetention();
}

export async function POST(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runRetention();
}

async function runRetention() {
  const svc = createServiceRoleClient();
  if (!svc) {
    return NextResponse.json(
      { ok: false, error: "Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }

  const result = await runReaderAnalyticsRetention(svc);
  const status = result.ok ? 200 : 500;
  return NextResponse.json(result, { status });
}
