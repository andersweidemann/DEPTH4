import { NextRequest, NextResponse } from "next/server";
import { cronAuthMatches, configuredCronSecrets } from "@/lib/cron-auth";
import { requireDepth4Admin } from "@/lib/depth4-admin-auth";
import { rewriteTargetedThesisLanguage } from "@/lib/thesis/rewrite-targeted";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function authorize(req: NextRequest): Promise<NextResponse | null> {
  if (cronAuthMatches(req, configuredCronSecrets())) return null;
  const auth = await requireDepth4Admin();
  if ("response" in auth) return auth.response;
  return null;
}

/** POST — deterministic compliance string rewrites for known thesis slugs (no LLM). */
export async function POST(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;

  try {
    const results = await rewriteTargetedThesisLanguage();
    const updated = results.filter((r) => r.changed).length;
    return NextResponse.json({ ok: true, updated, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "rewrite_targeted_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
