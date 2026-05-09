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

/** Default when `ANTHROPIC_MODEL` unset — strongest model for macro reasoning quality checks. */
const DEFAULT_MODEL = "claude-opus-4-7";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

type ClusterRow = {
  id: string;
  status: string;
  title_hint: string | null;
  member_news_event_ids: string[];
  signal_score: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
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
  const startedAt = Date.now();
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  const model = (process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  // Production safety: keep each cron invocation small so 30s schedulers don't time out.
  // Allow env var, but hard-cap to 1 by default.
  const clusterLimitEnv = clamp(Number(process.env.EVENT_REASONING_CLUSTER_LIMIT ?? "1"), 1, 25);
  const clusterLimit = Math.min(1, clusterLimitEnv);
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

  const summary = {
    ok: true,
    prompt_version: promptVersion,
    model,
    cluster_limit: clusterLimit,
    claimed_cluster_id: null as string | null,
    processed: 0,
    inserted: 0,
    skipped: 0,
    skip_reason: null as string | null,
    duration_ms: 0,
  };

  // Find + claim exactly one promoted cluster deterministically.
  // Claim uses optimistic concurrency on updated_at to avoid duplicate work on overlapping cron hits.
  const { data: promotedRows, error: clErr } = await admin
    .from("thesis_discovery_clusters")
    .select("id,status,title_hint,member_news_event_ids,signal_score,updated_at,created_at,metadata")
    .eq("status", "promoted")
    .order("updated_at", { ascending: false })
    .limit(20);

  if (clErr) {
    return NextResponse.json(
      { ok: false, error: clErr.message, stage: "load_promoted_clusters", duration_ms: Date.now() - startedAt },
      { status: 400 },
    );
  }

  const promoted = (promotedRows ?? []).filter(isClusterRow);
  if (!promoted.length) {
    summary.duration_ms = Date.now() - startedAt;
    summary.skipped = 1;
    summary.skip_reason = "no_promoted_clusters";
    console.info("[event-reasoning] skip: no promoted clusters", { promptVersion, durationMs: summary.duration_ms });
    return NextResponse.json(summary);
  }

  let claimed: ClusterRow | null = null;
  const claimToken = `claim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const claimNow = new Date().toISOString();

  for (const candidate of promoted) {
    // Already processed? (cheap check per candidate, bounded to <=20 rows)
    const { data: already, error: aErr } = await admin
      .from("event_reasoning")
      .select("id")
      .eq("cluster_id", candidate.id)
      .eq("prompt_version", promptVersion)
      .maybeSingle();

    if (aErr) {
      summary.duration_ms = Date.now() - startedAt;
      return NextResponse.json(
        { ok: false, error: aErr.message, stage: "reasoning_exists_check", candidate_cluster_id: candidate.id, duration_ms: summary.duration_ms },
        { status: 400 },
      );
    }
    if (already && typeof (already as { id?: unknown }).id === "string") {
      continue;
    }

    // Try to claim by bumping updated_at + annotating metadata.
    const prevUpdatedAt = (candidate.updated_at ?? "").trim();
    if (!prevUpdatedAt) continue;
    const prevMeta = candidate.metadata && typeof candidate.metadata === "object" ? candidate.metadata : {};
    const nextMeta = {
      ...prevMeta,
      reasoning_claim: {
        prompt_version: promptVersion,
        claimed_at: claimNow,
        claim_token: claimToken,
      },
    };

    const { data: updated, error: upErr } = await admin
      .from("thesis_discovery_clusters")
      .update({ updated_at: claimNow, metadata: nextMeta as never })
      .eq("id", candidate.id)
      .eq("status", "promoted")
      .eq("updated_at", prevUpdatedAt)
      .select("id,status,title_hint,member_news_event_ids,signal_score,updated_at,created_at,metadata")
      .maybeSingle();

    if (upErr) {
      console.info("[event-reasoning] claim_failed", { clusterId: candidate.id, error: upErr.message });
      continue;
    }
    if (!updated || typeof (updated as { id?: unknown }).id !== "string") {
      // Lost the race (another cron invocation claimed it).
      continue;
    }

    claimed = updated as unknown as ClusterRow;
    break;
  }

  if (!claimed) {
    summary.duration_ms = Date.now() - startedAt;
    summary.skipped = 1;
    summary.skip_reason = "no_unprocessed_promoted_clusters_or_claim_race";
    console.info("[event-reasoning] skip: none claimable", { promptVersion, durationMs: summary.duration_ms });
    return NextResponse.json(summary);
  }

  summary.claimed_cluster_id = claimed.id;
  console.info("[event-reasoning] claimed", { clusterId: claimed.id, promptVersion });

  const memberIds = claimed.member_news_event_ids.filter((id) => typeof id === "string" && id.length > 0);
  if (!memberIds.length) {
    summary.duration_ms = Date.now() - startedAt;
    summary.skipped = 1;
    summary.skip_reason = "empty_member_news_event_ids";
    console.info("[event-reasoning] skip: empty members", { clusterId: claimed.id, durationMs: summary.duration_ms });
    return NextResponse.json(summary);
  }

  const { data: newsData, error: newsErr } = await admin
    .from("news_events")
    .select("id,headline,body_text,published_at,signal_level,category,region,affected_tickers,affected_sectors")
    .in("id", memberIds);

  if (newsErr) {
    summary.duration_ms = Date.now() - startedAt;
    return NextResponse.json(
      { ok: false, error: newsErr.message, stage: "news_select", cluster_id: claimed.id, duration_ms: summary.duration_ms },
      { status: 400 },
    );
  }

  const newsRows = (newsData ?? []).filter(isNewsRow);
  if (!newsRows.length) {
    summary.duration_ms = Date.now() - startedAt;
    summary.skipped = 1;
    summary.skip_reason = "no_news_rows_for_members";
    console.info("[event-reasoning] skip: no news rows", { clusterId: claimed.id, durationMs: summary.duration_ms });
    return NextResponse.json(summary);
  }

  let anchorId: string;
  try {
    anchorId = pickAnchorNewsEventId(newsRows);
  } catch (e) {
    summary.duration_ms = Date.now() - startedAt;
    summary.skipped = 1;
    summary.skip_reason = e instanceof Error ? e.message : "anchor_pick_failed";
    console.info("[event-reasoning] skip: anchor pick failed", { clusterId: claimed.id, durationMs: summary.duration_ms });
    return NextResponse.json(summary);
  }

  const { data: dupAnchor, error: dupErr } = await admin
    .from("event_reasoning")
    .select("id")
    .eq("news_event_id", anchorId)
    .eq("prompt_version", promptVersion)
    .maybeSingle();

  if (dupErr) {
    summary.duration_ms = Date.now() - startedAt;
    return NextResponse.json(
      { ok: false, error: dupErr.message, stage: "dup_check", cluster_id: claimed.id, anchor_event_id: anchorId, duration_ms: summary.duration_ms },
      { status: 400 },
    );
  }
  if (dupAnchor && typeof (dupAnchor as { id?: unknown }).id === "string") {
    summary.duration_ms = Date.now() - startedAt;
    summary.skipped = 1;
    summary.skip_reason = "idempotent_skip_anchor_news_event_id_prompt_version";
    console.info("[event-reasoning] skip: dup anchor", { clusterId: claimed.id, anchorId, durationMs: summary.duration_ms });
    return NextResponse.json(summary);
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
    cluster_id: claimed.id,
    cluster_status: claimed.status,
    title_hint: claimed.title_hint,
    signal_score: claimed.signal_score,
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
    summary.duration_ms = Date.now() - startedAt;
    summary.processed = 1;
    summary.skipped = 1;
    summary.skip_reason = e instanceof Error ? e.message : "llm_failed";
    console.info("[event-reasoning] llm_failed", { clusterId: claimed.id, anchorId, durationMs: summary.duration_ms });
    return NextResponse.json(summary, { status: 502 });
  }

  let parsed: unknown;
  try {
    parsed = parseJsonObject<unknown>(text);
  } catch (e) {
    summary.duration_ms = Date.now() - startedAt;
    summary.processed = 1;
    summary.skipped = 1;
    summary.skip_reason = `json_parse: ${e instanceof Error ? e.message : "parse_failed"}`;
    console.info("[event-reasoning] json_parse_failed", { clusterId: claimed.id, anchorId, durationMs: summary.duration_ms });
    return NextResponse.json(summary, { status: 502 });
  }

  const validated = safeParseMacroEventReasoning(parsed);
  if (!validated.ok) {
    summary.duration_ms = Date.now() - startedAt;
    summary.processed = 1;
    summary.skipped = 1;
    summary.skip_reason = `schema: ${validated.error.message}`;
    console.info("[event-reasoning] schema_failed", { clusterId: claimed.id, anchorId, durationMs: summary.duration_ms });
    return NextResponse.json(summary, { status: 502 });
  }

  const { error: insErr, data: insRows } = await admin
    .from("event_reasoning")
    .insert({
      news_event_id: anchorId,
      cluster_id: claimed.id,
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
    summary.duration_ms = Date.now() - startedAt;
    summary.processed = 1;
    summary.skipped = 1;
    summary.skip_reason = code === "23505" ? "unique_violation_idempotent" : `insert: ${insErr.message}`;
    console.info("[event-reasoning] insert_failed", { clusterId: claimed.id, anchorId, code, durationMs: summary.duration_ms });
    return NextResponse.json(summary, { status: 502 });
  }

  const ins0 = Array.isArray(insRows) ? insRows[0] : null;
  const insertId = ins0 && typeof (ins0 as { id?: unknown }).id === "string" ? (ins0 as { id: string }).id : null;

  summary.processed = 1;
  summary.inserted = insertId ? 1 : 0;
  summary.duration_ms = Date.now() - startedAt;
  console.info("[event-reasoning] inserted", { clusterId: claimed.id, anchorId, insertId, durationMs: summary.duration_ms });
  return NextResponse.json({ ...summary, anchor_event_id: anchorId, insert_id: insertId });
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
