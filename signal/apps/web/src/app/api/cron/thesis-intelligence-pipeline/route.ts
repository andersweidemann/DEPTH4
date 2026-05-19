import { type NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertCronSecret } from "@/lib/cron-auth";
import { normalizeSupabaseUrl } from "@/lib/supabase/env";
import { runThesisPipeline } from "@/lib/ai/orchestrator";
import { newsRowsToPipelineItems } from "@/lib/ai/thesis-pipeline-context";
import { insertThesisPipelineTrace, signalLevelMixForMemberIds } from "@/lib/thesis-pipeline-audit/trace-writer";

export const runtime = "nodejs";

type DbNewsRow = {
  id: string;
  headline: unknown;
  body_text?: unknown;
  one_line_summary?: unknown;
  source?: unknown;
  published_at?: unknown;
  signal_level?: unknown;
};

async function runIntelligencePipeline(req: NextRequest) {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !service) {
    return NextResponse.json({ ok: false, error: "supabase_env_missing" }, { status: 500 });
  }

  const sinceHours = Math.min(48, Math.max(1, Number(req.nextUrl.searchParams.get("since_hours") || "2")));
  const batchSize = Math.min(24, Math.max(3, Number(req.nextUrl.searchParams.get("batch") || "12")));
  const sinceIso = new Date(Date.now() - sinceHours * 3_600_000).toISOString();

  const admin = createSupabaseJsClient(url, service, { auth: { persistSession: false } }) as SupabaseClient;

  const { data: rawNews, error: newsErr } = await admin
    .from("news_events")
    .select("id, headline, body_text, one_line_summary, source, published_at, signal_level")
    .gte("published_at", sinceIso)
    .order("signal_level", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(batchSize);

  if (newsErr) {
    return NextResponse.json({ ok: false, error: newsErr.message, stage: "news_select" }, { status: 400 });
  }

  const rows = (rawNews ?? []) as DbNewsRow[];
  const newsItems = newsRowsToPipelineItems(rows);
  if (newsItems.length < 2) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "insufficient_news",
      news_count: newsItems.length,
    });
  }

  const clusterId = `intel-pipeline-${new Date().toISOString().slice(0, 13)}`;
  const tierMix = signalLevelMixForMemberIds(
    rows.map((r) => ({
      id: r.id,
      signal_level: typeof r.signal_level === "number" ? r.signal_level : Number(r.signal_level ?? 1),
    })),
    rows.map((r) => r.id),
  );

  await insertThesisPipelineTrace(admin, {
    cluster_id: clusterId,
    stage: "reasoned",
    status: "pending",
    source_tier_mix: tierMix,
    meta: { news_count: newsItems.length, since_hours: sinceHours },
  });

  const result = await runThesisPipeline(newsItems, admin);

  await insertThesisPipelineTrace(admin, {
    cluster_id: clusterId,
    stage: result.success ? "thesis_promoted" : "validation",
    status: result.success ? "ok" : "rejected",
    reason_code: result.success ? null : result.reason,
    thesis_id: result.success ? result.thesisId : null,
    detail: result.success
      ? `saved:${result.slug}`
      : JSON.stringify({
          reason: result.reason,
          score: result.report?.score,
          blockers: result.report?.blockers,
          event: result.context.detectedEvent?.title,
          incentive_confidence: result.context.incentiveAnalysis?.confidence,
          mispricing: result.context.causalPropagation?.highestMispricing?.mispricingScore,
        }).slice(0, 3900),
    source_tier_mix: tierMix,
    prompt_version: "intelligence_pipeline_v1",
  });

  return NextResponse.json({
    ok: true,
    success: result.success,
    reason: result.success ? "thesis_saved" : result.reason,
    thesis_id: result.success ? result.thesisId : null,
    slug: result.success ? result.slug : null,
    quality_score: result.context.qualityReport?.score ?? null,
    event_title: result.context.detectedEvent?.title ?? null,
    incentive_confidence: result.context.incentiveAnalysis?.confidence ?? null,
    mispricing_score: result.context.causalPropagation?.highestMispricing?.mispricingScore ?? null,
    blockers: !result.success && "report" in result ? (result.report?.blockers ?? []) : [],
  });
}

export async function GET(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runIntelligencePipeline(req);
}

export async function POST(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runIntelligencePipeline(req);
}
