import { NextRequest, NextResponse } from "next/server";
import { cronAuthMatches, configuredCronSecrets } from "@/lib/cron-auth";
import { requireDepth4Admin } from "@/lib/depth4-admin-auth";
import { auditActiveThesesLanguage, rewriteAllTheses } from "@/lib/thesis/rewrite-all-theses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function parseBool(v: string | null): boolean {
  return v === "1" || v === "true" || v === "yes";
}

function parseOrigins(sp: URLSearchParams): string[] | undefined {
  const raw = sp.get("origins")?.trim();
  if (!raw) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

async function authorize(req: NextRequest): Promise<NextResponse | null> {
  if (cronAuthMatches(req, configuredCronSecrets())) return null;
  const auth = await requireDepth4Admin();
  if ("response" in auth) return auth.response;
  return null;
}

/** GET — audit flagged fields (no LLM). ?limit=50 */
export async function GET(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(500, Math.max(1, Number.parseInt(sp.get("limit") ?? "100", 10) || 100));

  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/service-role-client");
    const sb = createServiceRoleClient();
    if (!sb) {
      return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
    }

    const rows = await auditActiveThesesLanguage(sb, {
      limit,
      slug: sp.get("slug") ?? undefined,
      thesisOrigins: parseOrigins(sp),
    });

    const flagged = rows.filter((r) => r.flaggedFields > 0);
    return NextResponse.json({
      ok: true,
      scanned: rows.length,
      flaggedCount: flagged.length,
      rows: flagged,
      note: "Default origins: ai_generated, seeded_system. User theses excluded unless ?origins=user or include in list.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "audit_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST — bulk compliance rewrite (admin session or CRON_SECRET).
 *
 * Query: `limit=3` (smoke test), `dryRun=1`, `slug=…`, `origins=ai_generated,seeded_system`
 */
export async function POST(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const limitRaw = sp.get("limit");
  const limit = limitRaw ? Math.min(500, Math.max(1, Number.parseInt(limitRaw, 10) || 3)) : undefined;

  try {
    const result = await rewriteAllTheses({
      limit,
      dryRun: parseBool(sp.get("dryRun")),
      slug: sp.get("slug") ?? undefined,
      thesisOrigins: parseOrigins(sp),
    });

    return NextResponse.json({
      ok: true,
      ...result,
      logs: result.logs.map((l) => ({
        ...l,
        fieldChanges: l.fieldChanges.map((c) => ({
          path: c.path,
          violations: c.violations,
          beforePreview: c.before.slice(0, 200),
          afterPreview: c.after.slice(0, 200),
        })),
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "rewrite_failed";
    console.error("[admin/rewrite-theses]", message, e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
