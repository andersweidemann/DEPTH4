import { NextRequest, NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/cron-auth";
import { normalizeSupabaseUrl, normalizeSupabaseAnonKey } from "@/lib/supabase/env";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type DbNewsEvent = {
  id: string;
  headline: string;
  body_text: string | null;
  one_line_summary: string | null;
  published_at: string | null;
  signal_level: number;
  category: string | null;
  region: string | null;
  affected_tickers: unknown;
  affected_sectors: unknown;
  raw_json: unknown;
};

type DbConsequenceTree = {
  event_id: string;
  scenarios: unknown;
  forward_model: unknown;
};

type DbThesis = {
  id: string;
  title: string;
  status: string;
  thesis_origin?: string | null;
  insider_flow: {
    bullInstruments?: string[];
    bearInstruments?: string[];
    confirmTags?: string[];
    contradictTags?: string[];
  } | null;
  scenario_probabilities?: { base?: number; bull?: number; bear?: number } | null;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function lowerTokens(text: string): string {
  return (text || "").toLowerCase();
}

function matchesAnyTag(text: string, tags: string[]): string[] {
  const hay = lowerTokens(text);
  const matched: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    if (hay.includes(t)) matched.push(raw);
  }
  return matched;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeProb(p?: { base?: number; bull?: number; bear?: number } | null) {
  const base = clamp(Math.round(p?.base ?? 40), 1, 98);
  const bull = clamp(Math.round(p?.bull ?? 35), 1, 98);
  const bear = clamp(Math.round(p?.bear ?? 25), 1, 98);
  const sum = base + bull + bear;
  if (sum === 100) return { base, bull, bear };
  // Light renorm: adjust base to make sum 100.
  const nextBase = clamp(base + (100 - sum), 1, 98);
  return { base: nextBase, bull, bear };
}

function computeSuggestedUpdate(args: {
  prior: { base: number; bull: number; bear: number };
  signalLevel: number;
  confirmHit: boolean;
  contradictHit: boolean;
}) {
  const { prior, signalLevel, confirmHit, contradictHit } = args;

  // Conservative: only propose changes on market-moving items.
  if (signalLevel < 3) return null;
  if (!confirmHit && !contradictHit) return null;

  const bump = signalLevel >= 4 ? 12 : 7;
  const next = { ...prior };

  // Storage keys: base=messy win, bull=clean win, bear=thesis broken. Heuristic only nudges messy (base) up/down.
  // confirmHit => slightly higher conviction messy path; contradictHit => more weight to tails (clean/broken).
  if (confirmHit) {
    next.base = clamp(prior.base + bump, 5, 90);
    const take = next.base - prior.base;
    next.bull = clamp(prior.bull - Math.round(take * 0.5), 5, 90);
    next.bear = clamp(prior.bear - Math.round(take * 0.5), 5, 90);
  } else {
    // contradictHit
    next.base = clamp(prior.base - bump, 5, 90);
    const give = prior.base - next.base;
    next.bull = clamp(prior.bull + Math.round(give * 0.5), 5, 90);
    next.bear = clamp(prior.bear + Math.round(give * 0.5), 5, 90);
  }

  const sum = next.base + next.bull + next.bear;
  if (sum !== 100) next.base = clamp(next.base + (100 - sum), 5, 90);
  return { bump, next };
}

function meaningfulDelta(a: { base: number; bull: number; bear: number }, b: { base: number; bull: number; bear: number }) {
  return Math.max(Math.abs(a.base - b.base), Math.abs(a.bull - b.bull), Math.abs(a.bear - b.bear));
}

function normSym(s: string) {
  return String(s ?? "")
    .trim()
    .split(".", 1)[0]
    .toUpperCase();
}

function treeTextSnippet(tree: DbConsequenceTree | undefined, maxChars: number): string {
  if (!tree) return "";
  const parts: string[] = [];
  const fm = tree.forward_model;
  if (fm && typeof fm === "object" && !Array.isArray(fm)) {
    parts.push(JSON.stringify(fm).slice(0, maxChars));
  } else if (typeof fm === "string" && fm.trim()) {
    parts.push(fm.trim().slice(0, maxChars));
  }
  const sc = tree.scenarios;
  if (Array.isArray(sc) && sc.length) {
    parts.push(JSON.stringify(sc).slice(0, Math.floor(maxChars / 2)));
  }
  return parts.join("\n").slice(0, maxChars);
}

function buildNewsMatchText(ev: DbNewsEvent, tree: DbConsequenceTree | undefined): string {
  const sectors = Array.isArray(ev.affected_sectors) ? JSON.stringify(ev.affected_sectors) : String(ev.affected_sectors ?? "");
  const tickers = Array.isArray(ev.affected_tickers) ? JSON.stringify(ev.affected_tickers) : String(ev.affected_tickers ?? "");
  const treeBit = treeTextSnippet(tree, 2_500);
  const rawHint =
    ev.raw_json && typeof ev.raw_json === "object"
      ? JSON.stringify(ev.raw_json).slice(0, 1_500)
      : typeof ev.raw_json === "string"
        ? ev.raw_json.slice(0, 1_500)
        : "";
  return [
    ev.headline,
    ev.one_line_summary ? `Summary: ${ev.one_line_summary}` : "",
    ev.body_text ?? "",
    ev.category ? `Category: ${ev.category}` : "",
    ev.region ? `Region: ${ev.region}` : "",
    `Sectors: ${sectors}`,
    `Tickers: ${tickers}`,
    treeBit ? `Consequence_model_excerpt:\n${treeBit}` : "",
    rawHint ? `Raw_json_excerpt:\n${rawHint}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function GET(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runThesisNews(req);
}

export async function POST(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runThesisNews(req);
}

async function runThesisNews(req: NextRequest) {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !anon || !service) {
    return NextResponse.json(
      { ok: false, error: "Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }

  const admin = createSupabaseJsClient(url, service) as unknown as SupabaseClient;

  const now = new Date();
  const sinceMin = Number(req.nextUrl.searchParams.get("since_min") || "45");
  const sinceIso = new Date(now.getTime() - sinceMin * 60_000).toISOString();
  const limit = clamp(Number(req.nextUrl.searchParams.get("limit") || "50"), 1, 200);

  const autoApply = (process.env.THESIS_NEWS_AUTO_APPLY || "").trim() === "1";
  const applyThreshold = clamp(Number(process.env.THESIS_NEWS_APPLY_THRESHOLD || "8"), 3, 25);

  // Pull recent news.
  const newsRes = await admin
    .from("news_events")
    .select(
      "id,headline,body_text,one_line_summary,published_at,signal_level,category,region,affected_tickers,affected_sectors,raw_json",
    )
    .gte("published_at", sinceIso)
    .order("published_at", { ascending: false })
    .limit(limit);

  const news = (newsRes.data ?? []) as DbNewsEvent[];
  const newsError = newsRes.error ? String(newsRes.error.message || newsRes.error) : null;

  // Pull theses that are currently tracked (active-ish). No thesis_origin filter:
  // user-owned rows (`thesis_origin=user`) are included the same as catalog/system rows
  // when they have insider_flow monitoring + eligible status.
  const thesesRes = await admin
    .from("theses")
    .select("id,title,status,thesis_origin,insider_flow,scenario_probabilities")
    .in("status", ["forming", "watching", "ready", "active"]);

  const theses = (thesesRes.data ?? []) as DbThesis[];
  const thesesError = thesesRes.error ? String(thesesRes.error.message || thesesRes.error) : null;

  // Optionally pull trees for the events (for future use). Not required for MVP.
  const treeByEvent = new Map<string, DbConsequenceTree>();
  if (news.length) {
    const ids = news.map((n) => n.id);
    const treesRes = await admin
      .from("consequence_trees")
      .select("event_id,scenarios,forward_model")
      .in("event_id", ids)
      .order("generated_at", { ascending: false });
    for (const row of (treesRes.data ?? []) as DbConsequenceTree[]) {
      if (!treeByEvent.has(row.event_id)) treeByEvent.set(row.event_id, row);
    }
  }

  let evidenceInserted = 0;
  let evidenceDeduped = 0;
  let thesesUpdated = 0;

  let skipped_no_insider_monitor = 0;
  const skipSampleThesisIds: string[] = [];

  const matches: Array<{
    thesis_id: string;
    event_id: string;
    signal_level: number;
    reasons: string[];
    ticker_hits: string[];
    confirm_tags: string[];
    contradict_tags: string[];
    applied: boolean;
    delta_max?: number;
  }> = [];

  for (const t of theses) {
    const confirmTags = (t.insider_flow?.confirmTags ?? []).map(String).filter(Boolean);
    const contradictTags = (t.insider_flow?.contradictTags ?? []).map(String).filter(Boolean);
    const instrumentSyms = new Set<string>(
      [...(t.insider_flow?.bullInstruments ?? []), ...(t.insider_flow?.bearInstruments ?? [])]
        .map((x) => normSym(String(x)))
        .filter(Boolean),
    );
    const hasAnyConfig = confirmTags.length > 0 || contradictTags.length > 0 || instrumentSyms.size > 0;
    if (!hasAnyConfig) {
      skipped_no_insider_monitor += 1;
      if (skipSampleThesisIds.length < 8) {
        skipSampleThesisIds.push(
          `${t.id}:${(t.thesis_origin || "unknown").trim() || "unknown"}:${(t.status || "").trim() || "unknown"}`,
        );
      }
      continue;
    }

    const prior = normalizeProb(t.scenario_probabilities ?? null);

    for (const ev of news) {
      const text = buildNewsMatchText(ev, treeByEvent.get(ev.id));
      if (!text) continue;

      const confirmMatched = confirmTags.length ? matchesAnyTag(text, confirmTags) : [];
      const contradictMatched = contradictTags.length ? matchesAnyTag(text, contradictTags) : [];
      const evTickers = asStringArray(ev.affected_tickers).map((x) => normSym(String(x)));
      const tickerHits = instrumentSyms.size ? evTickers.filter((x) => instrumentSyms.has(x)) : [];
      const tickerHit = tickerHits.length > 0 && ev.signal_level >= 3;
      if (!confirmMatched.length && !contradictMatched.length && !tickerHit) continue;

      const reasons: string[] = [];
      if (tickerHit) reasons.push("ticker_hit");
      if (confirmMatched.length) reasons.push("confirm_tag");
      if (contradictMatched.length) reasons.push("contradict_tag");

      const suggestion = computeSuggestedUpdate({
        prior,
        signalLevel: ev.signal_level,
        confirmHit: confirmMatched.length > 0,
        contradictHit: contradictMatched.length > 0,
      });

      const deltaMax = suggestion ? meaningfulDelta(prior, suggestion.next) : 0;
      const shouldApply = autoApply && !!suggestion && deltaMax >= applyThreshold;

      const dedupeKey = `news:${ev.id}:${t.id}:r:${reasons.slice().sort().join("+")}:c:${confirmMatched.join("|")}:x:${contradictMatched.join("|")}:t:${tickerHits.join("|")}`;

      const insertRes = await admin.from("thesis_evidence_log").insert({
        thesis_id: t.id,
        event_type: "NEWS_DEVELOPMENT",
        description: ev.headline,
        probability_before: prior,
        probability_after: shouldApply && suggestion ? suggestion.next : null,
        metadata: {
          source: "news_events",
          event_id: ev.id,
          signal_level: ev.signal_level,
          published_at: ev.published_at,
          ticker_hits: tickerHits,
          confirm_tags: confirmMatched,
          contradict_tags: contradictMatched,
          reasons,
          tree: treeByEvent.get(ev.id) ? { present: true } : { present: false },
        },
        dedupe_key: dedupeKey,
      } as never);

      if (insertRes.error) {
        // Most likely unique violation due to retries.
        evidenceDeduped += 1;
      } else {
        evidenceInserted += 1;
      }

      if (shouldApply && suggestion) {
        const up = await admin
          .from("theses")
          .update({ scenario_probabilities: suggestion.next, updated_at: new Date().toISOString() })
          .eq("id", t.id);
        if (!up.error) thesesUpdated += 1;
      }

      matches.push({
        thesis_id: t.id,
        event_id: ev.id,
        signal_level: ev.signal_level,
        reasons,
        ticker_hits: tickerHits,
        confirm_tags: confirmMatched,
        contradict_tags: contradictMatched,
        applied: shouldApply,
        delta_max: suggestion ? deltaMax : undefined,
      });
    }
  }

  console.info(
    "[thesis-news]",
    JSON.stringify({
      task: "thesis_news_refresh",
      thesis_rows_status_eligible: theses.length,
      skipped_no_insider_flow_monitor_config: skipped_no_insider_monitor,
      skip_sample_thesis_ids: skipSampleThesisIds,
      news_count: news.length,
      evidence_inserted: evidenceInserted,
      evidence_deduped: evidenceDeduped,
      theses_scenario_rows_updated: thesesUpdated,
      auto_apply: autoApply,
      apply_threshold: applyThreshold,
    }),
  );

  return NextResponse.json({
    ok: true,
    since_iso: sinceIso,
    limit,
    auto_apply: autoApply,
    apply_threshold: applyThreshold,
    news_count: news.length,
    theses_count: theses.length,
    evidence_inserted: evidenceInserted,
    evidence_deduped: evidenceDeduped,
    theses_updated: thesesUpdated,
    matches: matches.slice(0, 100),
    errors: { news: newsError, theses: thesesError },
    refresh_scope: {
      thesis_rows_status_eligible: theses.length,
      skipped_no_insider_flow_monitor_config: skipped_no_insider_monitor,
      skip_sample_thesis_ids: skipSampleThesisIds,
    },
  });
}

