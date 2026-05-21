import { NextRequest, NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/cron-auth";
import { backfillSeededTheses } from "@/lib/thesis/backfill-seeded-theses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function parseBool(v: string | null): boolean {
  return v === "1" || v === "true" || v === "yes";
}

/**
 * POST — Kimi backfill for `seeded_system` theses with minimal `body` JSON.
 * Auth: `CRON_SECRET` via Authorization or x-cron-secret (see assertCronSecret).
 *
 * Query: `limit=1` (smoke), `dryRun=1`, `slug=war-peace-gold-short`
 */
export async function POST(req: NextRequest) {
  const denied = assertCronSecret(req);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const limitRaw = sp.get("limit");
  const limit = limitRaw ? Math.min(20, Math.max(1, Number.parseInt(limitRaw, 10) || 1)) : undefined;

  try {
    const result = await backfillSeededTheses({
      slug: sp.get("slug") ?? undefined,
      limit,
      dryRun: parseBool(sp.get("dryRun")),
    });

    return NextResponse.json({
      ok: true,
      processed: result.processed,
      errors: result.errors,
      total: result.total,
      skipped: result.skipped,
      dryRun: result.dryRun,
      slugs: result.slugs,
      logs: result.logs,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "backfill_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
