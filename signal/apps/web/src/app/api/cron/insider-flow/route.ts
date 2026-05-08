import { NextRequest, NextResponse } from "next/server";
import { normalizeSupabaseUrl, normalizeSupabaseAnonKey } from "@/lib/supabase/env";
import { detectInsiderFlowAnomaly } from "@/lib/thesis-engine-v2/insider-flow/detect";
import type { InsiderFlowAnomaly } from "@/lib/thesis-engine-v2/insider-flow/types";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { getMarketSnapshotsBatch } from "@/lib/market-data";
import type { TwelveBatchResult } from "@/lib/market-data";
import { buildMockMarketSnapshot } from "@/lib/thesis-engine-v2/insider-flow/mock-market";
import type { InstrumentFlowSnapshot } from "@/lib/thesis-engine-v2/insider-flow/types";
import webpush from "web-push";

export const runtime = "nodejs";

type DbNewsEvent = {
  headline: unknown;
  published_at?: unknown;
  created_at?: unknown;
};

type DbThesis = {
  id: string;
  title: string;
  status: string;
  insider_flow: { bullInstruments?: string[]; bearInstruments?: string[]; confirmTags?: string[]; contradictTags?: string[] } | null;
  scenario_probabilities?: { base?: number; bull?: number; bear?: number } | null;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function leadScenario(p: { base: number; bull: number; bear: number }) {
  return (["base", "bull", "bear"] as const).reduce((best, k) => (p[k] > p[best] ? k : best), "base");
}

function computeProbabilitySuggestion(args: {
  prior: { base: number; bull: number; bear: number };
  patternType: "BULL_LEAK" | "BEAR_LEAK";
  zMaxAbs: number;
  volMax: number;
  alignedCount: number;
}) {
  const { prior, patternType, zMaxAbs, volMax, alignedCount } = args;

  // Weak/strong/multi-instrument mapping (MVP).
  let bump = 7;
  if (zMaxAbs >= 2 || volMax >= 5) bump = 15;
  if (alignedCount >= 3) bump = 20;
  bump = clamp(bump, 5, 25);

  const next = { ...prior };
  if (patternType === "BULL_LEAK") {
    next.bull = prior.bull + bump;
    next.bear = prior.bear - Math.round(bump * 0.7);
  } else {
    next.bear = prior.bear + bump;
    next.bull = prior.bull - Math.round(bump * 0.7);
  }
  next.base = 100 - next.bull - next.bear;

  // Clamp + light renorm.
  next.bull = clamp(next.bull, 5, 90);
  next.bear = clamp(next.bear, 5, 90);
  next.base = clamp(next.base, 5, 90);
  const sum = next.base + next.bull + next.bear;
  if (sum !== 100) next.base = clamp(next.base + (100 - sum), 5, 90);

  return { bump, next, oldLead: leadScenario(prior), newLead: leadScenario(next) };
}

function matchesAnyTag(text: string, tags: string[]) {
  const hay = text.toLowerCase();
  const matched: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    if (hay.includes(t)) matched.push(raw);
  }
  return matched;
}

function pickBestHeadlineForTags(headlines: Array<{ headline: string; atMs: number }>, tags: string[]) {
  // Choose the most recent headline that matches at least one tag.
  let best: { headline: string; atMs: number; matched: string[] } | null = null;
  for (const h of headlines) {
    const matched = matchesAnyTag(h.headline, tags);
    if (!matched.length) continue;
    if (!best || h.atMs > best.atMs) best = { ...h, matched };
  }
  return best;
}

function sign(x: number) {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

function getVapid() {
  const pub = (process.env.VAPID_PUBLIC_KEY ?? "").trim();
  const priv = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  const email = (process.env.VAPID_EMAIL ?? "").trim();
  if (!pub || !priv || !email) return null;
  return { pub, priv, email };
}

async function pushToUsers(args: {
  admin: SupabaseClient;
  userIds: string[];
  payload: { title: string; body: string; url: string; tag: string };
}) {
  const { admin, userIds, payload } = args;
  if (!userIds.length) return { attempted: 0, sent: 0, removed: 0 };

  const v = getVapid();
  if (!v) return { attempted: 0, sent: 0, removed: 0 };
  webpush.setVapidDetails(v.email, v.pub, v.priv);

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth")
    .in("user_id", userIds)
    .limit(5000);

  const rows =
    (subs ?? []).map((r: { id?: unknown; user_id?: unknown; endpoint?: unknown; p256dh?: unknown; auth?: unknown }) => ({
      id: String(r.id ?? ""),
      userId: String(r.user_id ?? ""),
      endpoint: String(r.endpoint ?? ""),
      p256dh: String(r.p256dh ?? ""),
      auth: String(r.auth ?? ""),
    })) ?? [];

  let attempted = 0;
  let sent = 0;
  let removed = 0;

  for (const s of rows) {
    if (!s.endpoint || !s.p256dh || !s.auth) continue;
    attempted += 1;
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        },
        JSON.stringify(payload),
      );
      sent += 1;
    } catch (e: unknown) {
      const statusCode = typeof (e as { statusCode?: unknown }).statusCode === "number"
        ? (e as { statusCode: number }).statusCode
        : null;
      if (statusCode === 410 || statusCode === 404) {
        await admin.from("push_subscriptions").delete().eq("id", s.id);
        removed += 1;
      }
    }
  }

  return { attempted, sent, removed };
}

function shouldInvalidateOnReversal(args: {
  patternType: "BULL_LEAK" | "BEAR_LEAK";
  originalR15BySymbol: Record<string, number>;
  current: InstrumentFlowSnapshot[];
}) {
  const { patternType, originalR15BySymbol, current } = args;
  if (!current.length) return false;

  let reversed = 0;
  for (const s of current) {
    const orig = originalR15BySymbol[s.symbol];
    if (!Number.isFinite(orig)) continue;
    const o = orig;
    const c = s.return_15m;

    // Reversal definition:
    // - opposite sign vs original
    // - magnitude is comparable (>= 0.8x original abs)
    // - and still meaningful move (|z|>=1.25 OR volume_multiple>=2.0)
    if (sign(o) !== 0 && sign(c) === -sign(o) && Math.abs(c) >= Math.abs(o) * 0.8) {
      const meaningful = Math.abs(s.z_score) >= 1.25 || s.volume_multiple >= 2;
      if (meaningful) reversed += 1;
    }
  }

  // If most moved instruments reversed, call it invalidated.
  const threshold = Math.max(1, Math.ceil(current.length * 0.6));
  if (reversed < threshold) return false;

  // Pattern sanity: ensure reversal direction contradicts leak direction.
  // (This is implicit via original sign flip, but keep pattern-specific phrasing for reason string.)
  return patternType === "BULL_LEAK" || patternType === "BEAR_LEAK";
}

export async function GET(req: NextRequest) {
  // Minimal protection for cron: allow if no secret set (local), else require header match.
  const secret = (process.env.INSIDER_FLOW_CRON_SECRET ?? "").trim();
  if (secret) {
    const got = (req.headers.get("x-insider-flow-secret") ?? "").trim();
    if (!got || got !== secret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const nowMs = Date.now();
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (!url || !anon || !service) {
    return NextResponse.json(
      { ok: false, error: "Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }

  // Cast to an untyped client so newly added tables don't break builds before types are regenerated.
  const admin = createSupabaseJsClient(url, service, { auth: { persistSession: false } }) as unknown as SupabaseClient;

  // STARRED-ONLY scan: find which thesis IDs are starred by any user.
  const { data: starredRows } = await admin.from("thesis_stars").select("thesis_id").limit(5000);
  const starredIds = new Set((starredRows ?? []).map((r: { thesis_id?: unknown }) => String(r.thesis_id ?? "")).filter(Boolean));

  // Fetch theses with insider_flow configured (active-ish only).
  const { data: thesesRaw } = await admin
    .from("theses")
    .select("id,title,status,insider_flow,scenario_probabilities")
    .not("insider_flow", "is", null)
    .in("status", ["watching", "ready", "active"])
    .limit(500);

  const thesesAll: DbThesis[] = (thesesRaw ?? []) as DbThesis[];
  const theses: DbThesis[] = thesesAll.filter((t) => starredIds.has(t.id));

  // Recent headlines from Supabase news_events (last 30 min).
  const sinceIso = new Date(nowMs - 30 * 60_000).toISOString();
  const { data: news } = await admin
    .from("news_events")
    .select("headline,published_at,created_at")
    .or(`published_at.gte.${sinceIso},created_at.gte.${sinceIso}`)
    .order("published_at", { ascending: false })
    .limit(200);
  const recentHeadlines = (news ?? [])
    .map((n: DbNewsEvent) => ({
      headline: String(n.headline ?? ""),
      atMs: Date.parse(String(n.published_at ?? n.created_at ?? "")) || nowMs,
    }))
    .filter((x) => x.headline);

  const symbols = Array.from(
    new Set(
      theses.flatMap((t) => [
        ...(((t.insider_flow?.bullInstruments ?? []) as string[]) ?? []),
        ...(((t.insider_flow?.bearInstruments ?? []) as string[]) ?? []),
      ]),
    ),
  );

  // Baselines from Supabase (MVP shape: use cached volatility_30d + per-hour volume).
  const baselinesBySymbol: Record<string, { volatility_30d: number | null; baseline_volume_30m: number | null } | undefined> = {};
  if (symbols.length) {
    const { data: baseRows } = await admin
      .from("instrument_baselines")
      .select("instrument,volatility_30d,avg_volume_by_hour")
      .in("instrument", symbols)
      .limit(5000);
    for (const r of (baseRows ?? []) as Array<{ instrument?: unknown; volatility_30d?: unknown; avg_volume_by_hour?: unknown }>) {
      const instrument = String(r.instrument ?? "").trim();
      if (!instrument) continue;
      const vol = typeof r.volatility_30d === "number" ? r.volatility_30d : Number(r.volatility_30d);
      const volOk = Number.isFinite(vol) ? vol : null;
      let baselineVol30m: number | null = null;
      const avh = r.avg_volume_by_hour;
      if (avh && typeof avh === "object") {
        // hour key in ET, stored as string "0".."23". baseline is 6 * avg 5m volume.
        const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).formatToParts(new Date());
        const hourStr = parts.find((p) => p.type === "hour")?.value ?? "";
        const v = (avh as Record<string, unknown>)[String(Number(hourStr))];
        const avg5m = typeof v === "number" ? v : Number(v);
        if (Number.isFinite(avg5m) && avg5m > 0) baselineVol30m = avg5m * 6;
      }
      baselinesBySymbol[instrument] = { volatility_30d: volOk, baseline_volume_30m: baselineVol30m };
    }
  }

  // Market data batch (5min, outputsize=7 for 30m volume + 15m return).
  let rate: TwelveBatchResult["rateLimit"] | null = null;
  let creditsUsed = 0;
  let symbolsRequested = symbols.length;
  let symbolsFailed = 0;
  let failedSymbols: string[] = [];
  const market: Record<string, InstrumentFlowSnapshot | undefined> = {};
  if (symbols.length) {
    const batch = await getMarketSnapshotsBatch({ symbols, baselinesBySymbol });
    rate = batch.meta.rateLimit;
    creditsUsed = batch.meta.creditsUsed;
    symbolsRequested = symbols.length;

    const errs = batch.meta.errorsBySymbol ?? {};
    failedSymbols = Object.entries(errs)
      .filter(([, v]) => v?.status === "error")
      .map(([k]) => k)
      .slice(0, 40);
    symbolsFailed = failedSymbols.length;

    if (symbolsFailed) {
      const msg = failedSymbols
        .map((s) => {
          const e = errs[s];
          const m = e?.message ? ` (${e.message})` : "";
          return `${s}${m}`;
        })
        .join(", ");
      // eslint-disable-next-line no-console
      console.warn(`Twelve Data errors: ${msg}`);
    }

    // Pause scanning if close to daily limit.
    if (typeof rate?.remaining === "number" && rate.remaining < 50) {
      return NextResponse.json(
        {
          ok: false,
          error: "rate_limit_low_remaining",
          rateLimit: rate,
          creditsUsed,
          symbols_requested: symbolsRequested,
          symbols_failed: symbolsFailed,
          failed_symbols: failedSymbols,
          scanned: theses.length,
        },
        { status: 429 },
      );
    }

    for (const [sym, snap] of Object.entries(batch.snapshots)) {
      if (!snap) continue;
      market[sym] = {
        symbol: snap.symbol,
        return_1m: snap.return_1m,
        return_5m: snap.return_5m,
        return_15m: snap.return_15m,
        volume_30m: snap.volume_30m,
        baseline_volume_30m: snap.baseline_volume_30m,
        volume_multiple: snap.volume_multiple,
        z_score: snap.z_score,
      };
    }
  }
  if (!Object.keys(market).length && symbols.length) {
    Object.assign(market, buildMockMarketSnapshot(nowMs, symbols));
  }

  const anomalies: InsiderFlowAnomaly[] = [];
  for (const t of theses) {
    const cfg = t.insider_flow;
    if (!cfg) continue;
    const a = detectInsiderFlowAnomaly({
      nowMs,
      thesisId: t.id,
      thesisTitle: t.title,
      bullInstruments: (cfg.bullInstruments ?? []) as string[],
      bearInstruments: (cfg.bearInstruments ?? []) as string[],
      confirmTags: (cfg.confirmTags ?? []) as string[],
      recentHeadlines,
      market,
    });
    if (a) anomalies.push(a);
  }

  let written = 0;
  let deduped = 0;
  let updated_confirmed = 0;
  let updated_invalidated = 0;
  let push_attempted = 0;
  let push_sent = 0;
  let push_removed = 0;

  if (anomalies.length) {
    // Deduplicate: skip if similar anomaly already exists recently for the thesis.
    const thesisIds = Array.from(new Set(anomalies.map((a) => a.thesisId)));
    const recentIso = new Date(nowMs - 15 * 60_000).toISOString();
    const { data: recentRows } = await admin
      .from("flow_anomalies")
      .select("thesis_id,pattern_type,status,created_at")
      .in("thesis_id", thesisIds)
      .gte("created_at", recentIso)
      .order("created_at", { ascending: false })
      .limit(500);

    const recentKey = new Set(
      (recentRows ?? []).map((r: { thesis_id?: unknown; pattern_type?: unknown; status?: unknown }) => {
        return `${String(r.thesis_id ?? "")}|${String(r.pattern_type ?? "")}|${String(r.status ?? "")}`;
      }),
    );

    // Write anomalies (service-role, no user context).
    const toInsert = anomalies
      .filter((a) => {
        const k = `${a.thesisId}|${a.patternType}|${a.status}`;
        if (recentKey.has(k)) return false;
        return true;
      })
      .map((a) => {
        const t = theses.find((x) => x.id === a.thesisId);
        const priorRaw = t?.scenario_probabilities ?? null;
        const prior = {
          base: typeof priorRaw?.base === "number" ? priorRaw.base : 40,
          bull: typeof priorRaw?.bull === "number" ? priorRaw.bull : 35,
          bear: typeof priorRaw?.bear === "number" ? priorRaw.bear : 25,
        };

        const zMaxAbs = a.instrumentsMoved.reduce((m, x) => Math.max(m, Math.abs(x.z_score)), 0);
        const volMax = a.instrumentsMoved.reduce((m, x) => Math.max(m, x.volume_multiple), 0);
        const alignedCount = a.instrumentsMoved.length;
        const sug = computeProbabilitySuggestion({ prior, patternType: a.patternType, zMaxAbs, volMax, alignedCount });

        return {
          thesis_id: a.thesisId,
          thesis_title: a.thesisTitle,
          pattern_type: a.patternType,
          status: a.status,
          instruments_moved: a.instrumentsMoved,
          return_data: a.instrumentsMoved.reduce((acc, x) => {
            acc[x.symbol] = { r1: x.return_1m, r5: x.return_5m, r15: x.return_15m };
            return acc;
          }, {} as Record<string, unknown>),
          volume_multiple: volMax,
          z_score: zMaxAbs,
          matched_tags: a.matchedTags,
          confirmed_headline_at: a.confirmedHeadlineAt ? new Date(a.confirmedHeadlineAt).toISOString() : null,
          invalidated_at: a.invalidatedAt ? new Date(a.invalidatedAt).toISOString() : null,
          probability_suggestion: sug.next,
          status_reason:
            a.status === "CONFIRMED_MOVE"
              ? `headline_match (+${sug.bump}pts; lead ${sug.oldLead}→${sug.newLead})`
              : `tape_only (+${sug.bump}pts; lead ${sug.oldLead}→${sug.newLead})`,
          notes: a.notes ?? null,
        };
      });

    deduped = anomalies.length - toInsert.length;

    const { data: inserted } = await admin
      .from("flow_anomalies")
      .insert(toInsert)
      .select("id,thesis_id,thesis_title,pattern_type,status,probability_suggestion,created_at")
      .throwOnError();
    written = toInsert.length;

    // Evidence log (server-side persistence) for inserted anomalies.
    const insRows =
      (inserted ?? []).map((r: { id?: unknown; thesis_id?: unknown; created_at?: unknown; probability_suggestion?: unknown; pattern_type?: unknown }) => {
        const anomalyId = String(r.id ?? "");
        const thesisId = String(r.thesis_id ?? "");
        const t = theses.find((x) => x.id === thesisId);
        const priorRaw = t?.scenario_probabilities ?? null;
        const prior = {
          base: typeof priorRaw?.base === "number" ? priorRaw.base : 40,
          bull: typeof priorRaw?.bull === "number" ? priorRaw.bull : 35,
          bear: typeof priorRaw?.bear === "number" ? priorRaw.bear : 25,
        };
        const after = r.probability_suggestion && typeof r.probability_suggestion === "object" ? r.probability_suggestion : null;
        const pt = String(r.pattern_type ?? "");
        const desc = `Insider flow detected (${pt}). Probability suggestion stored.`;
        return {
          thesis_id: thesisId,
          event_type: "insider_flow",
          description: desc,
          probability_before: prior,
          probability_after: after,
          metadata: { anomaly_id: anomalyId },
          dedupe_key: `if:${anomalyId}:insider_flow`,
        };
      }) ?? [];
    if (insRows.length) {
      await admin.from("thesis_evidence_log").upsert(insRows, { onConflict: "dedupe_key" });
    }

    // Push notifications (Pro only): notify users who starred the thesis and have a subscription.
    const insertedRows = (inserted ?? []) as Array<{ id: string; thesis_id: string; thesis_title: string; pattern_type: string }>;
    if (insertedRows.length) {
      const tids = Array.from(new Set(insertedRows.map((r) => String(r.thesis_id ?? "")).filter(Boolean)));
      const { data: starRows } = await admin.from("thesis_stars").select("user_id,thesis_id").in("thesis_id", tids).limit(10000);
      const starPairs =
        (starRows ?? []).map((r: { user_id?: unknown; thesis_id?: unknown }) => ({
          userId: String(r.user_id ?? ""),
          thesisId: String(r.thesis_id ?? ""),
        })) ?? [];
      const userIds = Array.from(new Set(starPairs.map((p) => p.userId).filter(Boolean)));
      const { data: users } = await admin.from("users").select("id,tier,notification_preferences").in("id", userIds).limit(5000);
      const proIds = new Set(
        (users ?? [])
          .filter((u: { id?: unknown; tier?: unknown; notification_preferences?: unknown }) => String(u.tier ?? "") === "pro")
          .map((u: { id?: unknown }) => String(u.id ?? "")),
      );

      for (const a of insertedRows) {
        const thId = String(a.thesis_id ?? "");
        const watchers = starPairs.filter((p) => p.thesisId === thId).map((p) => p.userId).filter((id) => proIds.has(id));
        if (!watchers.length) continue;
        const payload = {
          title: "Insider Flow Detected",
          body: `${a.thesis_title}: ${a.pattern_type === "BULL_LEAK" ? "Bull leak" : "Bear leak"} (new signal)`,
          url: `/theses/${encodeURIComponent(thId)}`,
          tag: `anomaly-${String(a.id ?? "")}`,
        };
        const res = await pushToUsers({ admin, userIds: watchers, payload });
        push_attempted += res.attempted;
        push_sent += res.sent;
        push_removed += res.removed;
      }
    }
  }

  // Follow-up: promote UNCONFIRMED_LEAK → CONFIRMED_MOVE if confirm-tags show up after.
  // (Lookback window keeps it cheap.)
  {
    const lookbackIso = new Date(nowMs - 2 * 60 * 60_000).toISOString();
    const { data: unconfirmed } = await admin
      .from("flow_anomalies")
      .select("id,created_at,thesis_id,status,pattern_type,return_data")
      .eq("status", "UNCONFIRMED_LEAK")
      .gte("created_at", lookbackIso)
      .order("created_at", { ascending: false })
      .limit(200);

    for (const row of (unconfirmed ?? []) as Array<{
      id: string;
      created_at: string;
      thesis_id: string;
      status: string;
      pattern_type: "BULL_LEAK" | "BEAR_LEAK";
      return_data: unknown;
    }>) {
      const tid = String(row.thesis_id);
      const t = theses.find((x) => x.id === tid);
      const tags = (t?.insider_flow?.confirmTags ?? []).filter(Boolean);
      const contradict = (t?.insider_flow?.contradictTags ?? []).filter(Boolean);
      if (!tags.length && !contradict.length) continue;

      // Query news since anomaly creation (up to now).
      const rowCreatedIso = row.created_at;
      const { data: newsSince } = await admin
        .from("news_events")
        .select("headline,published_at,created_at")
        .or(`published_at.gte.${rowCreatedIso},created_at.gte.${rowCreatedIso}`)
        .order("published_at", { ascending: false })
        .limit(200);
      const heads = (newsSince ?? [])
        .map((n: DbNewsEvent) => ({
          headline: String(n.headline ?? ""),
          atMs: Date.parse(String(n.published_at ?? n.created_at ?? "")) || nowMs,
        }))
        .filter((x) => x.headline);

      const bestConfirm = tags.length ? pickBestHeadlineForTags(heads, tags) : null;
      const bestContradict = contradict.length ? pickBestHeadlineForTags(heads, contradict) : null;
      const rowCreatedMs = Date.parse(row.created_at) || nowMs;

      if (bestConfirm && bestContradict) {
        // Priority: most recent relevant headline wins. Record clearly why.
        if (bestContradict.atMs >= bestConfirm.atMs) {
          await admin
            .from("flow_anomalies")
            .update({
              status: "INVALIDATED",
              invalidated_at: new Date(nowMs).toISOString(),
              matched_tags: bestContradict.matched,
              status_reason: `contradicting_headline (${Math.max(1, Math.round((bestContradict.atMs - rowCreatedMs) / 60000))}m)`,
            })
            .eq("id", row.id)
            .throwOnError();
          updated_invalidated += 1;

          await admin.from("thesis_evidence_log").upsert(
            {
              thesis_id: tid,
              event_type: "insider_flow_invalidated",
              description: "Anomaly invalidated by contradicting headline.",
              metadata: { anomaly_id: row.id, matched_tags: bestContradict.matched },
              dedupe_key: `if:${row.id}:invalidated`,
            },
            { onConflict: "dedupe_key" },
          );
        } else {
          await admin
            .from("flow_anomalies")
            .update({
              status: "CONFIRMED_MOVE",
              matched_tags: bestConfirm.matched,
              confirmed_headline_at: new Date(bestConfirm.atMs).toISOString(),
              status_reason: `confirmed_after_leak (${Math.max(1, Math.round((bestConfirm.atMs - rowCreatedMs) / 60000))}m)`,
            })
            .eq("id", row.id)
            .throwOnError();
          updated_confirmed += 1;

          await admin.from("thesis_evidence_log").upsert(
            {
              thesis_id: tid,
              event_type: "insider_flow_confirmed",
              description: "Anomaly confirmed by headline after initial leak.",
              metadata: { anomaly_id: row.id, matched_tags: bestConfirm.matched },
              dedupe_key: `if:${row.id}:confirmed`,
            },
            { onConflict: "dedupe_key" },
          );
        }
        continue;
      }

      if (bestContradict) {
        await admin
          .from("flow_anomalies")
          .update({
            status: "INVALIDATED",
            invalidated_at: new Date(nowMs).toISOString(),
            matched_tags: bestContradict.matched,
            status_reason: `contradicting_headline (${Math.max(1, Math.round((bestContradict.atMs - rowCreatedMs) / 60000))}m)`,
          })
          .eq("id", row.id)
          .throwOnError();
        updated_invalidated += 1;
        await admin.from("thesis_evidence_log").upsert(
          {
            thesis_id: tid,
            event_type: "insider_flow_invalidated",
            description: "Anomaly invalidated by contradicting headline.",
            metadata: { anomaly_id: row.id, matched_tags: bestContradict.matched },
            dedupe_key: `if:${row.id}:invalidated`,
          },
          { onConflict: "dedupe_key" },
        );
        continue;
      }

      if (bestConfirm) {
        await admin
          .from("flow_anomalies")
          .update({
            status: "CONFIRMED_MOVE",
            matched_tags: bestConfirm.matched,
            confirmed_headline_at: new Date(bestConfirm.atMs).toISOString(),
            status_reason: `confirmed_after_leak (${Math.max(1, Math.round((bestConfirm.atMs - rowCreatedMs) / 60000))}m)`,
          })
          .eq("id", row.id)
          .throwOnError();
        updated_confirmed += 1;
        await admin.from("thesis_evidence_log").upsert(
          {
            thesis_id: tid,
            event_type: "insider_flow_confirmed",
            description: "Anomaly confirmed by headline after initial leak.",
            metadata: { anomaly_id: row.id, matched_tags: bestConfirm.matched },
            dedupe_key: `if:${row.id}:confirmed`,
          },
          { onConflict: "dedupe_key" },
        );
      }
    }
  }

  // Invalidation: mark recent UNCONFIRMED_LEAK as INVALIDATED on strong reversal vs original move.
  {
    const lookbackIso = new Date(nowMs - 2 * 60 * 60_000).toISOString();
    const { data: unconfirmed } = await admin
      .from("flow_anomalies")
      .select("id,created_at,thesis_id,pattern_type,status,instruments_moved,return_data")
      .eq("status", "UNCONFIRMED_LEAK")
      .gte("created_at", lookbackIso)
      .order("created_at", { ascending: false })
      .limit(200);

    for (const row of (unconfirmed ?? []) as Array<{
      id: string;
      created_at: string;
      thesis_id: string;
      pattern_type: "BULL_LEAK" | "BEAR_LEAK";
      instruments_moved: unknown;
      return_data: unknown;
    }>) {
      const createdMs = Date.parse(row.created_at) || nowMs;
      if (nowMs - createdMs < 20 * 60_000) continue; // give it some time before calling reversal

      const moved = Array.isArray(row.instruments_moved) ? (row.instruments_moved as Array<{ symbol?: unknown }>) : [];
      const symbols = moved.map((m) => String(m.symbol ?? "").trim().toUpperCase()).filter(Boolean);
      if (!symbols.length) continue;

      const originalR15BySymbol: Record<string, number> = {};
      const rd = row.return_data as Record<string, unknown> | null;
      if (rd && typeof rd === "object") {
        for (const s of symbols) {
          const v = rd[s];
          const r15 = (v as { r15?: unknown } | undefined)?.r15;
          if (typeof r15 === "number") originalR15BySymbol[s] = r15;
        }
      }

      // Re-fetch current snapshots in a single batch for the row's moved instruments.
      const rowBaselines: Record<string, { volatility_30d: number | null; baseline_volume_30m: number | null } | undefined> = {};
      for (const s of symbols) rowBaselines[s] = baselinesBySymbol[s];
      const batch = await getMarketSnapshotsBatch({ symbols, baselinesBySymbol: rowBaselines });
      const current: InstrumentFlowSnapshot[] = [];
      for (const s of symbols) {
        const snap = batch.snapshots[s];
        if (!snap) continue;
        current.push({
          symbol: snap.symbol,
          return_1m: snap.return_1m,
          return_5m: snap.return_5m,
          return_15m: snap.return_15m,
          volume_30m: snap.volume_30m,
          baseline_volume_30m: snap.baseline_volume_30m,
          volume_multiple: snap.volume_multiple,
          z_score: snap.z_score,
        });
      }
      if (!current.length) continue;

      if (
        shouldInvalidateOnReversal({
          patternType: row.pattern_type,
          originalR15BySymbol,
          current,
        })
      ) {
        await admin
          .from("flow_anomalies")
          .update({
            status: "INVALIDATED",
            invalidated_at: new Date(nowMs).toISOString(),
            status_reason: "price_reversal",
          })
          .eq("id", row.id)
          .throwOnError();
        updated_invalidated += 1;

        await admin.from("thesis_evidence_log").upsert(
          {
            thesis_id: String(row.thesis_id),
            event_type: "insider_flow_invalidated",
            description: "Anomaly invalidated by price reversal.",
            metadata: { anomaly_id: row.id },
            dedupe_key: `if:${row.id}:invalidated`,
          },
          { onConflict: "dedupe_key" },
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    nowMs,
    scanned: theses.length,
    symbols_requested: symbolsRequested,
    symbols_failed: symbolsFailed,
    failed_symbols: failedSymbols,
    anomalies_detected: anomalies.length,
    anomalies_written: written,
    anomalies_deduped: deduped,
    updated_confirmed,
    updated_invalidated,
    twelve_rate_limit: rate,
    twelve_credits_used: creditsUsed,
    push_attempted,
    push_sent,
    push_removed,
  });
}

