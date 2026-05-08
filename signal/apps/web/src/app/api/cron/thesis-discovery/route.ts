import { type NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertCronSecret } from "@/lib/cron-auth";
import { normalizeSupabaseUrl } from "@/lib/supabase/env";
import {
  clusterNewsEvents,
  filterEventsInWindow,
  getDefaultClusteringOptions,
  type NewsEventRow,
} from "@/lib/thesis-discovery/news-clustering";

export const runtime = "nodejs";

type DbNewsRow = {
  id: unknown;
  headline: unknown;
  body_text?: unknown;
  source?: unknown;
  published_at?: unknown;
  created_at?: unknown;
  signal_level?: unknown;
  category?: unknown;
  region?: unknown;
  affected_sectors?: unknown;
  affected_tickers?: unknown;
};

function parseNewsRows(data: unknown): NewsEventRow[] {
  if (!Array.isArray(data)) return [];
  const out: NewsEventRow[] = [];
  for (const r of data as DbNewsRow[]) {
    const id = typeof r.id === "string" ? r.id : String(r.id ?? "");
    if (!id) continue;
    const headline = typeof r.headline === "string" ? r.headline : String(r.headline ?? "");
    if (!headline.trim()) continue;
    const sl = typeof r.signal_level === "number" ? r.signal_level : Number(r.signal_level ?? 1);
    out.push({
      id,
      headline,
      body_text: r.body_text == null ? null : String(r.body_text),
      source: r.source == null ? null : String(r.source),
      published_at: r.published_at == null ? null : String(r.published_at),
      created_at: r.created_at == null ? null : String(r.created_at),
      signal_level: Number.isFinite(sl) ? Math.min(4, Math.max(1, Math.round(sl))) : 1,
      category: r.category == null ? null : String(r.category),
      region: r.region == null ? null : String(r.region),
      affected_sectors: r.affected_sectors,
      affected_tickers: r.affected_tickers,
    });
  }
  return out;
}

async function runThesisDiscovery() {
  const nowMs = Date.now();
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (!url || !service) {
    return NextResponse.json(
      { ok: false, error: "Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }

  const opts = getDefaultClusteringOptions();
  const admin = createSupabaseJsClient(url, service, { auth: { persistSession: false } }) as unknown as SupabaseClient;

  const { data: rawNews, error: newsErr } = await admin
    .from("news_events")
    .select(
      "id,headline,body_text,source,published_at,created_at,signal_level,category,region,affected_sectors,affected_tickers",
    )
    // Prefer ingest time so rows with null published_at are not sorted to the tail of a large cap.
    .order("created_at", { ascending: false })
    .limit(1200);

  if (newsErr) {
    return NextResponse.json({ ok: false, error: newsErr.message, stage: "news_select" }, { status: 400 });
  }

  const parsed = parseNewsRows(rawNews);
  const inWindow = filterEventsInWindow(parsed, nowMs, opts.windowHours);
  const allClusters = clusterNewsEvents(inWindow, nowMs, opts);
  const candidates = allClusters.filter((c) => c.passesPromotionGate);

  let inserted = 0;
  let updated = 0;
  let skippedPromoted = 0;
  const skippedBelowGate = allClusters.length - candidates.length;

  for (const c of candidates) {
    const fingerprintPayload = { fingerprint: c.fingerprint };

    const { data: existingRows, error: findErr } = await admin
      .from("thesis_discovery_clusters")
      .select("id,status")
      .contains("metadata", fingerprintPayload as never)
      .limit(1);
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;

    if (findErr) {
      return NextResponse.json(
        { ok: false, error: findErr.message, stage: "cluster_lookup", fingerprint: c.fingerprint },
        { status: 400 },
      );
    }

    const row = {
      status: "candidate" as const,
      title_hint: c.titleHint,
      member_news_event_ids: c.memberIds,
      signal_score: c.signalScore,
      metadata: { ...c.metadata, fingerprint: c.fingerprint, pipeline: "phase2_clustering" },
      updated_at: new Date(nowMs).toISOString(),
    };

    if (existing && typeof (existing as { id?: unknown }).id === "string") {
      const st = String((existing as { status?: unknown }).status ?? "");
      if (st === "promoted") {
        skippedPromoted += 1;
        continue;
      }
      const { error: upErr } = await admin
        .from("thesis_discovery_clusters")
        .update(row)
        .eq("id", (existing as { id: string }).id);
      if (upErr) {
        return NextResponse.json(
          { ok: false, error: upErr.message, stage: "cluster_update", id: (existing as { id: string }).id },
          { status: 400 },
        );
      }
      updated += 1;
    } else {
      const insertRow = {
        ...row,
        created_at: new Date(nowMs).toISOString(),
      };
      const { error: insErr } = await admin.from("thesis_discovery_clusters").insert(insertRow);
      if (insErr) {
        return NextResponse.json(
          { ok: false, error: insErr.message, stage: "cluster_insert", fingerprint: c.fingerprint },
          { status: 400 },
        );
      }
      inserted += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    nowMs,
    options: {
      window_hours: opts.windowHours,
      jaccard_merge: opts.jaccardMerge,
      jaccard_same_topic: opts.jaccardMergeSameTopic,
      min_events_for_candidate: opts.minEventsForCandidate,
      signal_score_threshold: opts.signalScoreThreshold,
    },
    news_rows_loaded: parsed.length,
    news_rows_in_window: inWindow.length,
    clusters_formed: allClusters.length,
    clusters_below_gate: skippedBelowGate,
    candidates_upserted: inserted + updated,
    candidates_inserted: inserted,
    candidates_updated: updated,
    skipped_promoted_fingerprint: skippedPromoted,
  });
}

export async function GET(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runThesisDiscovery();
}

export async function POST(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runThesisDiscovery();
}
