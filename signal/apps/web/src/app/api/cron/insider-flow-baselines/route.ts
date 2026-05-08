import { NextRequest, NextResponse } from "next/server";
import { normalizeSupabaseUrl, normalizeSupabaseAnonKey } from "@/lib/supabase/env";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { getDailyBars } from "@/lib/market-data";

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

export async function GET(req: NextRequest) {
  const secret = (process.env.INSIDER_FLOW_CRON_SECRET ?? "").trim();
  if (secret) {
    const got = (req.headers.get("x-insider-flow-secret") ?? "").trim();
    if (!got || got !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !anon || !service) {
    return NextResponse.json({ ok: false, error: "Supabase env missing" }, { status: 500 });
  }
  const admin = createSupabaseJsClient(url, service, { auth: { persistSession: false } });

  // Only refresh baselines for instruments that appear in STARRED theses.
  const { data: starredRows } = await admin.from("thesis_stars").select("thesis_id").limit(5000);
  const starredIds = new Set((starredRows ?? []).map((r: { thesis_id?: unknown }) => String(r.thesis_id ?? "")).filter(Boolean));

  const { data: thesesRaw } = await admin
    .from("theses")
    .select("id,insider_flow,status")
    .not("insider_flow", "is", null)
    .in("status", ["watching", "ready", "active"])
    .limit(1000);

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

  for (const sym of all) {
    // Skip baseline for always-on instruments in this MVP if TwelveData daily series isn't meaningful.
    // (You can remove this if you want daily baselines for crypto/FX too.)
    if (isAlwaysOnInstrument(sym)) continue;

    const bars = await getDailyBars(sym);
    if (bars.length < 20) continue;

    const closes = bars.map((b) => b.close).filter((x) => Number.isFinite(x));
    const rets: number[] = [];
    for (let i = 1; i < closes.length; i++) rets.push(pctChange(closes[i - 1]!, closes[i]!));
    const vol30d = std(rets.slice(-30)) || std(rets) || 0.0001;

    // Volume-by-hour baseline is computed from intraday in a fuller version.
    // MVP: write empty object; main cron will fallback if missing.
    const avg_volume_by_hour: Record<string, number> = {};

    await admin
      .from("instrument_baselines")
      .upsert(
        {
          instrument: sym,
          volatility_30d: vol30d,
          avg_volume_by_hour,
          last_updated: new Date().toISOString(),
        },
        { onConflict: "instrument" },
      )
      .throwOnError();
    updated += 1;
  }

  return NextResponse.json({ ok: true, instruments_considered: all.length, updated });
}

