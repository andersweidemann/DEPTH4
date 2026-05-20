import { NextRequest, NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/cron-auth";
import { normalizeSupabaseUrl, normalizeSupabaseAnonKey } from "@/lib/supabase/env";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { getDailyBars, getIntraday5mBars } from "@/lib/market-data";

export const runtime = "nodejs";

function mean(xs: number[]) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = mean(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

function pctChange(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return 0;
  return (b - a) / a;
}

function isAlwaysOnInstrument(symbol: string) {
  return symbol.includes("/");
}

function median(xs: number[]) {
  const a = xs.filter((x) => Number.isFinite(x)).slice().sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  if (a.length % 2) return a[mid]!;
  return (a[mid - 1]! + a[mid]!) / 2;
}

function hourKey(tsMs: number, tz: "America/New_York" | "UTC") {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false }).formatToParts(new Date(tsMs));
  const hh = parts.find((p) => p.type === "hour")?.value ?? "";
  const n = Number(hh);
  return Number.isFinite(n) ? String(n) : "0";
}

function isMissingBaselinesTable(message: string | undefined) {
  const m = (message ?? "").toLowerCase();
  return m.includes("instrument_baselines") && (m.includes("schema cache") || m.includes("does not exist"));
}

export async function GET(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;

  try {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !anon || !service) {
    return NextResponse.json({ ok: false, error: "Supabase env missing" }, { status: 500 });
  }
  const admin = createSupabaseJsClient(url, service, { auth: { persistSession: false } }) as unknown as SupabaseClient;

  const { error: tableProbeErr } = await admin.from("instrument_baselines").select("instrument").limit(1);
  if (tableProbeErr && isMissingBaselinesTable(tableProbeErr.message)) {
    return NextResponse.json(
      {
        ok: false,
        error: "instrument_baselines_table_missing",
        hint: "Apply Supabase migration signal/supabase/migrations/20260508123800_instrument_baselines_and_stars.sql (instrument_baselines section) in the SQL editor, then retry.",
      },
      { status: 503 },
    );
  }
  if (tableProbeErr) {
    return NextResponse.json({ ok: false, error: "instrument_baselines_probe_failed", detail: tableProbeErr.message }, { status: 500 });
  }

  // Only refresh baselines for instruments that appear in STARRED theses.
  const { data: starredRows, error: starsErr } = await admin.from("thesis_stars").select("thesis_id").limit(5000);
  if (starsErr) {
    return NextResponse.json({ ok: false, error: "thesis_stars_query_failed", detail: starsErr.message }, { status: 500 });
  }
  const starredIds = new Set((starredRows ?? []).map((r: { thesis_id?: unknown }) => String(r.thesis_id ?? "")).filter(Boolean));

  const { data: thesesRaw, error: thesesErr } = await admin
    .from("theses")
    .select("id,insider_flow,status")
    .not("insider_flow", "is", null)
    .in("status", ["watching", "ready", "active"])
    .limit(1000);
  if (thesesErr) {
    return NextResponse.json({ ok: false, error: "theses_query_failed", detail: thesesErr.message }, { status: 500 });
  }

  const instruments = new Set<string>();
  for (const row of (thesesRaw ?? []) as Array<{ id?: unknown; insider_flow?: unknown }>) {
    const id = String(row.id ?? "");
    if (!starredIds.has(id)) continue;
    const cfg = row.insider_flow as { bullInstruments?: unknown; bearInstruments?: unknown } | null;
    const bull = Array.isArray(cfg?.bullInstruments) ? (cfg!.bullInstruments as unknown[]).map(String) : [];
    const bear = Array.isArray(cfg?.bearInstruments) ? (cfg!.bearInstruments as unknown[]).map(String) : [];
    for (const s of [...bull, ...bear]) {
      const sym = String(s).trim();
      if (sym) instruments.add(sym);
    }
  }

  const all = Array.from(instruments);
  let updated = 0;
  let api_calls = 0;

  for (const sym of all) {
    // Volatility baseline (daily bars).
    const bars = await getDailyBars(sym);
    api_calls += 1;
    if (bars.length < 20) continue;

    const closes = bars.map((b) => b.close).filter((x) => Number.isFinite(x));
    const rets: number[] = [];
    for (let i = 1; i < closes.length; i++) rets.push(pctChange(closes[i - 1]!, closes[i]!));
    const vol30d = std(rets.slice(-30)) || std(rets) || 0.0001;

    // Intraday volume-by-hour baseline (median 5-min bar volume grouped by hour).
    // - Stocks/ETFs: ET timezone (hours 9..15 mostly; 9:30 maps to hour 9)
    // - 24/7 instruments: UTC timezone (hours 0..23)
    const tz = isAlwaysOnInstrument(sym) ? ("UTC" as const) : ("America/New_York" as const);
    const intra = await getIntraday5mBars(sym, 5000);
    api_calls += 1;
    const buckets: Record<string, number[]> = {};
    for (const b of intra) {
      const k = hourKey(b.tsMs, tz);
      if (!buckets[k]) buckets[k] = [];
      buckets[k]!.push(b.volume || 0);
    }
    const avg_volume_by_hour: Record<string, number> = {};
    for (const [k, xs] of Object.entries(buckets)) {
      const m = median(xs);
      if (m > 0) avg_volume_by_hour[k] = m;
    }

    const { error: upsertErr } = await admin.from("instrument_baselines").upsert(
      {
        instrument: sym,
        volatility_30d: vol30d,
        avg_volume_by_hour,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "instrument" },
    );
    if (upsertErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "instrument_baselines_upsert_failed",
          instrument: sym,
          detail: upsertErr.message,
        },
        { status: 500 },
      );
    }
    updated += 1;
  }

  return NextResponse.json({ ok: true, instruments_considered: all.length, updated, api_calls });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/insider-flow-baselines]", message);
    return NextResponse.json({ ok: false, error: "internal_error", detail: message }, { status: 500 });
  }
}

