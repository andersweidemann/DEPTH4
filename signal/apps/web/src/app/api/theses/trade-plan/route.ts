import { computeLiveTradePlan, mapAssetToQuoteSymbol } from "@/lib/thesis-engine-v2/live-trade-plan";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { createClient } from "@/lib/supabase/server";
import { getDailyBars } from "@/lib/market-data";
import { NextResponse } from "next/server";
import { isDepth4PublicReadMode } from "@/lib/depth4-public-read-mode";

const STATUSES: Thesis["status"][] = ["forming", "watching", "ready", "active", "resolved", "invalidated"];
const DIRECTIONS: Thesis["direction"][] = ["long", "short", "watch"];

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user && !isDepth4PublicReadMode()) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const asset = typeof o.asset === "string" ? o.asset.trim() : "";
  const direction = o.direction as Thesis["direction"];
  const status = o.status as Thesis["status"];
  const convictionRaw = o.convictionPct ?? o.probability;
  const convictionPct =
    typeof convictionRaw === "number" && Number.isFinite(convictionRaw)
      ? Math.min(100, Math.max(0, convictionRaw))
      : null;

  if (!asset) {
    return NextResponse.json({ ok: false, error: "asset required" }, { status: 400 });
  }
  if (!DIRECTIONS.includes(direction)) {
    return NextResponse.json({ ok: false, error: "direction invalid" }, { status: 400 });
  }
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ ok: false, error: "status invalid" }, { status: 400 });
  }

  const quoteSymbol = mapAssetToQuoteSymbol(asset);
  if (!quoteSymbol) {
    return NextResponse.json({
      ok: true,
      trade_plan: {
        ready: false,
        entry_zone: { min: null, max: null, mid: null },
        stop: null,
        target1: null,
        target2: null,
      },
      quote_symbol: null,
      as_of_ms: null,
      note: "unsupported_asset",
    });
  }

  const bars = await getDailyBars(quoteSymbol);
  const result = computeLiveTradePlan({
    bars,
    direction,
    status,
    quoteSymbol,
    convictionPct,
  });

  return NextResponse.json({
    ok: true,
    trade_plan: result.trade_plan,
    quote_symbol: result.quote_symbol,
    as_of_ms: result.as_of_ms,
    spot: result.spot,
    atr: result.atr,
    conviction_pct: convictionPct,
  });
}
