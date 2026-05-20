import { NextRequest, NextResponse } from "next/server";
import { cronAuthMatches, configuredCronSecrets } from "@/lib/cron-auth";
import { requireDepth4Admin } from "@/lib/depth4-admin-auth";
import { backfillSeededTheses } from "@/lib/thesis/backfill-seeded-theses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function parseBool(v: string | null): boolean {
  return v === "1" || v === "true" || v === "yes";
}

async function authorize(req: NextRequest): Promise<NextResponse | null> {
  if (cronAuthMatches(req, configuredCronSecrets())) return null;
  const auth = await requireDepth4Admin();
  if ("response" in auth) return auth.response;
  return null;
}

/**
 * POST — Kimi backfill for `seeded_system` theses with minimal `body` JSON.
 *
 * Query: `limit=1` (smoke), `dryRun=1`, `slug=war-peace-gold-short`
 */
export async function POST(req: NextRequest) {
  const denied = await authorize(req);
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

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "backfill_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
