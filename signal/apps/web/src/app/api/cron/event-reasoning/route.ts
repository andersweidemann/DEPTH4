import { parseJsonObject } from "@signal/ai";
import { type NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { anthropicMessages } from "@/lib/macro-reasoning/anthropic-messages";
import {
  MACRO_EVENT_REASONING_PROMPT_VERSION,
  MACRO_EVENT_REASONING_SYSTEM,
  buildMacroReasoningUserPrompt,
  type MacroReasoningClusterContext,
  type MacroReasoningMemberEvent,
  type MacroReasoningThesisStub,
} from "@/lib/macro-reasoning/prompts";
import { pickAnchorNewsEventId } from "@/lib/macro-reasoning/pick-anchor";
import { safeParseMacroEventReasoning } from "@/lib/macro-reasoning/schema";
import { assertCronSecret } from "@/lib/cron-auth";
import { normalizeSupabaseUrl } from "@/lib/supabase/env";

export const runtime = "nodejs";

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

type ClusterRow = {
  id: string;
  status: string;
  title_hint: string | null;
  member_news_event_ids: string[];
  signal_score: number | null;
};

type NewsRow = {
  id: string;
  headline: string;
  body_text: string | null;
  published_at: string | null;
  signal_level: number;
  category: string | null;
  region: string | null;
  affected_tickers: unknown;
  affected_sectors: unknown;
};

function isClusterRow(x: unknown): x is ClusterRow {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string" && Array.isArray(o.member_news_event_ids);
}

function isNewsRow(x: unknown): x is NewsRow {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.headline === "string";
}

function isThesisStub(x: unknown): x is MacroReasoningThesisStub {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.title === "string";
}

async function runEventReasoning() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  const model = (process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const clusterLimit = clamp(Number(process.env.EVENT_REASONING_CLUSTER_LIMIT ?? "3"), 1, 25);
  const maxTokens = clamp(Number(process.env.EVENT_REASONING_MAX_TOKENS ?? "4096"), 512, 8192);

  if (!url || !service) {
    return NextResponse.json(
      { ok: false, error: "Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 503 });
  }

  const admin = createSupabaseJsClient(url, service, { auth: { persistSession: false } }) as unknown as SupabaseClient;
  const promptVersion = MACRO_EVENT_REASONING_PROMPT_VERSION;

  const { data: existingRows, error: exErr } = await admin
    .from("event_reasoning")
    .select("cluster_id")
    .eq("prompt_version", promptVersion)
    .not("cluster_id", "is", null);

  if (exErr) {
    return NextResponse.json({ ok: false, error: exErr.message, stage: "load_existing_reasoning" }, { status: 400 });
  }

  const doneClusterIds = new Set(
    (existingRows ?? [])
      .map((r: { cluster_id?: unknown }) => (typeof r.cluster_id === "string" ? r.cluster_id : null))
      .filter(Boolean) as string[],
  );

  const { data: clusterData, error: clErr } = await admin
    .from("thesis_discovery_clusters")
    .select("id,status,title_hint,member_news_event_ids,signal_score")
    .eq("status", "promoted")
    .order("updated_at", { ascending: false })
    .limit(80);

  if (clErr) {
    return NextResponse.json({ ok: false, error: clErr.message, stage: "load_clusters" }, { status: 400 });
  }

  const clusters = (clusterData ?? []).filter(isClusterRow).filter((c) => !doneClusterIds.has(c.id)).slice(0, clusterLimit);

  const { data: thesisData, error: thErr } = await admin
    .from("theses")
    .select("id,title")
    .in("status", ["forming", "watching", "ready", "active"])
    .limit(120);

  if (thErr) {
    return NextResponse.json({ ok: false, error: thErr.message, stage: "load_theses" }, { status: 400 });
  }

  const knownTheses: MacroReasoningThesisStub[] = (thesisData ?? [])
    .filter(isThesisStub)
    .filter((t) => t.title.trim().length > 0);

  const results: Array<{
    cluster_id: string;
    anchor_event_id?: string;
    ok: boolean;
    error?: string;
    insert_id?: string;
  }> = [];

  for (const cluster of clusters) {
    const memberIds = cluster.member_news_event_ids.filter((id) => typeof id === "string" && id.length > 0);
    if (!memberIds.length) {
      results.push({ cluster_id: cluster.id, ok: false, error: "empty_member_news_event_ids" });
      continue;
    }

    const { data: newsData, error: newsErr } = await admin
      .from("news_events")
      .select("id,headline,body_text,published_at,signal_level,category,region,affected_tickers,affected_sectors")
      .in("id", memberIds);

    if (newsErr) {
      results.push({ cluster_id: cluster.id, ok: false, error: `news_select: ${newsErr.message}` });
      continue;
    }

    const newsRows = (newsData ?? []).filter(isNewsRow);
    if (!newsRows.length) {
      results.push({ cluster_id: cluster.id, ok: false, error: "no_news_rows_for_members" });
      continue;
    }

    let anchorId: string;
    try {
      anchorId = pickAnchorNewsEventId(newsRows);
    } catch (e) {
      results.push({
        cluster_id: cluster.id,
        ok: false,
        error: e instanceof Error ? e.message : "anchor_pick_failed",
      });
      continue;
    }

    const { data: dupAnchor, error: dupErr } = await admin
      .from("event_reasoning")
      .select("id")
      .eq("news_event_id", anchorId)
      .eq("prompt_version", promptVersion)
      .maybeSingle();

    if (dupErr) {
      results.push({ cluster_id: cluster.id, anchor_event_id: anchorId, ok: false, error: `dup_check: ${dupErr.message}` });
      continue;
    }
    if (dupAnchor && typeof (dupAnchor as { id?: unknown }).id === "string") {
      results.push({
        cluster_id: cluster.id,
        anchor_event_id: anchorId,
        ok: false,
        error: "idempotent_skip_anchor_news_event_id_prompt_version",
      });
      continue;
    }

    const memberEvents: MacroReasoningMemberEvent[] = newsRows.map((n) => ({
      id: n.id,
      headline: n.headline,
      body_excerpt: n.body_text,
      signal_level: n.signal_level,
      published_at: n.published_at,
      category: n.category,
      region: n.region,
      affected_tickers: n.affected_tickers,
      affected_sectors: n.affected_sectors,
    }));

    const ctx: MacroReasoningClusterContext = {
      cluster_id: cluster.id,
      cluster_status: cluster.status,
      title_hint: cluster.title_hint,
      signal_score: cluster.signal_score,
      anchor_event_id: anchorId,
      member_events: memberEvents,
      known_theses: knownTheses.length ? knownTheses : undefined,
    };

    const user = buildMacroReasoningUserPrompt(ctx);
    let text: string;
    let raw: unknown;
    try {
      const out = await anthropicMessages({
        apiKey,
        model,
        maxTokens,
        system: MACRO_EVENT_REASONING_SYSTEM,
        user,
      });
      text = out.text;
      raw = out.raw;
    } catch (e) {
      results.push({
        cluster_id: cluster.id,
        anchor_event_id: anchorId,
        ok: false,
        error: e instanceof Error ? e.message : "llm_failed",
      });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parseJsonObject<unknown>(text);
    } catch (e) {
      results.push({
        cluster_id: cluster.id,
        anchor_event_id: anchorId,
        ok: false,
        error: `json_parse: ${e instanceof Error ? e.message : "parse_failed"}`,
      });
      continue;
    }

    const validated = safeParseMacroEventReasoning(parsed);
    if (!validated.ok) {
      results.push({
        cluster_id: cluster.id,
        anchor_event_id: anchorId,
        ok: false,
        error: `schema: ${validated.error.message}`,
      });
      continue;
    }

    const { error: insErr, data: insRows } = await admin
      .from("event_reasoning")
      .insert({
        news_event_id: anchorId,
        cluster_id: cluster.id,
        reasoning: validated.data,
        raw_response: { anthropic: raw, assistant_text: text },
        model,
        prompt_version: promptVersion,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .limit(1);

    if (insErr) {
      const code = (insErr as { code?: string }).code;
      if (code === "23505") {
        results.push({
          cluster_id: cluster.id,
          anchor_event_id: anchorId,
          ok: false,
          error: "unique_violation_idempotent",
        });
        continue;
      }
      results.push({
        cluster_id: cluster.id,
        anchor_event_id: anchorId,
        ok: false,
        error: `insert: ${insErr.message}`,
      });
      continue;
    }

    const ins0 = Array.isArray(insRows) ? insRows[0] : null;
    const insertId = ins0 && typeof (ins0 as { id?: unknown }).id === "string" ? (ins0 as { id: string }).id : undefined;
    results.push({ cluster_id: cluster.id, anchor_event_id: anchorId, ok: true, insert_id: insertId });
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    prompt_version: promptVersion,
    model,
    cluster_limit: clusterLimit,
    promoted_pending_total: (clusterData ?? []).filter(isClusterRow).filter((c) => !doneClusterIds.has(c.id)).length,
    clusters_attempted: clusters.length,
    inserted: okCount,
    results,
  });
}

export async function GET(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runEventReasoning();
}

export async function POST(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runEventReasoning();
}
