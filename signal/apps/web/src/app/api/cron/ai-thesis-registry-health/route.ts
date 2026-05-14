import { type NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertCronSecret } from "@/lib/cron-auth";
import { normalizeSupabaseUrl } from "@/lib/supabase/env";

export const runtime = "nodejs";

/**
 * Part D — monitoring for the macro → `public.theses` (`ai_generated`) pipeline.
 *
 * Schedule (example): Vercel Cron `0 */6 * * *` → `GET /api/cron/ai-thesis-registry-health` with cron auth headers.
 *
 * Env:
 * - `AI_THESIS_HEALTH_STALE_ALERT_HOURS` (default `36`): if **no** `ai_generated` row was **created** in the last 24h
 *   and the newest `ai_generated.created_at` is older than this many hours, `alert_pipeline_stale` is true and we
 *   log `console.error` for log drains / alerts.
 */
function staleThresholdHours(): number {
  const raw = (process.env.AI_THESIS_HEALTH_STALE_ALERT_HOURS ?? "36").trim();
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 6) return 36;
  return Math.min(168, n);
}

async function runHealth(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;

  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !service) {
    return NextResponse.json(
      { ok: false, error: "Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }

  const admin = createSupabaseJsClient(url, service, { auth: { persistSession: false } }) as unknown as SupabaseClient;
  const threshold = staleThresholdHours();
  const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count: createdLast24h, error: cErr } = await admin
    .from("theses")
    .select("id", { count: "exact", head: true })
    .eq("thesis_origin", "ai_generated")
    .gte("created_at", dayAgoIso);

  if (cErr) {
    return NextResponse.json({ ok: false, error: cErr.message, stage: "count_24h" }, { status: 400 });
  }

  const { count: formingCreatedLast24h, error: fErr } = await admin
    .from("theses")
    .select("id", { count: "exact", head: true })
    .eq("thesis_origin", "ai_generated")
    .eq("status", "forming")
    .gte("created_at", dayAgoIso);

  if (fErr) {
    return NextResponse.json({ ok: false, error: fErr.message, stage: "count_forming_24h" }, { status: 400 });
  }

  const { data: newestRow, error: nErr } = await admin
    .from("theses")
    .select("created_at")
    .eq("thesis_origin", "ai_generated")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (nErr) {
    return NextResponse.json({ ok: false, error: nErr.message, stage: "newest_created" }, { status: 400 });
  }

  const newestIso =
    newestRow && typeof (newestRow as { created_at?: unknown }).created_at === "string"
      ? ((newestRow as { created_at: string }).created_at as string)
      : null;
  const newestMs = newestIso ? Date.parse(newestIso) : NaN;
  const hoursSinceNewest =
    newestIso && !Number.isNaN(newestMs) ? (Date.now() - newestMs) / (60 * 60 * 1000) : null;

  const hasAnyAiRow = Boolean(newestIso);
  const count24 = createdLast24h ?? 0;
  const forming24 = formingCreatedLast24h ?? 0;

  const alertPipelineStale =
    hasAnyAiRow &&
    count24 === 0 &&
    hoursSinceNewest !== null &&
    hoursSinceNewest >= threshold;

  if (alertPipelineStale) {
    console.error("[ai-thesis-registry-health] ALERT: no new ai_generated theses in 24h while pipeline idle", {
      ai_generated_created_last_24h: count24,
      ai_forming_created_last_24h: forming24,
      newest_ai_created_at: newestIso,
      hours_since_newest_ai_created: Math.round((hoursSinceNewest ?? 0) * 10) / 10,
      stale_threshold_hours: threshold,
    });
  }

  return NextResponse.json({
    ok: true,
    ai_generated_created_last_24h: count24,
    ai_forming_created_last_24h: forming24,
    newest_ai_created_at: newestIso,
    hours_since_newest_ai_created:
      hoursSinceNewest === null ? null : Math.round(hoursSinceNewest * 10) / 10,
    stale_threshold_hours: threshold,
    alert_pipeline_stale: alertPipelineStale,
    hint: "Registry rows only exist after DEPTH4 validation; feed-only rejects stay on event_reasoning.",
  });
}

export async function GET(req: NextRequest) {
  return runHealth(req);
}

export async function POST(req: NextRequest) {
  return runHealth(req);
}
