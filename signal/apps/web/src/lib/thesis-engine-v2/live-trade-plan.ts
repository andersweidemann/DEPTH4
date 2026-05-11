/**
 * ATR-based levels from hero **asset** only. Future: bias bands using `Thesis.thesisDepthBook` +
 * `selectPrimaryTradeNode` when primary edge targets a different ticker than `thesis.asset`.
 */
import type { LiveTradePlan, Thesis } from "@/lib/thesis-engine-v2/types";
import type { OhlcvBar } from "@/lib/market-data";

/** Maps thesis primary asset labels to Twelve Data symbols (daily series). */
export function mapAssetToQuoteSymbol(assetRaw: string): string | null {
  const a = assetRaw.trim().toUpperCase();
  if (!a || a === "—" || a === "-") return null;

  const map: Record<string, string> = {
    XAUUSD: "XAU/USD",
    USOIL: "WTI",
    GLD: "GLD",
    TLT: "TLT",
    RTX: "RTX",
    QQQ: "QQQ",
    HG: "HG",
    META: "META",
    SPY: "SPY",
    USO: "USO",
    WTI: "WTI",
    BRENT: "BRENT",
    CL: "WTI",
  };

  if (map[a]) return map[a];
  if (/^[A-Z][A-Z0-9./\-]*$/.test(a)) return a;
  return null;
}

export function formatTradePlanPrice(n: number): string {
  const abs = Math.abs(n);
  if (!Number.isFinite(abs)) return "—";
  if (abs >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 100) return n.toFixed(2);
  if (abs >= 10) return n.toFixed(2);
  if (abs >= 1) return n.toFixed(3);
  return n.toFixed(4);
}

export function formatEntryZoneLabel(plan: LiveTradePlan): string | null {
  if (!plan.ready) return null;
  const { min, max, mid } = plan.entry_zone;
  if (min != null && max != null && Math.abs(max - min) > 1e-9) {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return `${formatTradePlanPrice(lo)} – ${formatTradePlanPrice(hi)}`;
  }
  if (mid != null) return formatTradePlanPrice(mid);
  return null;
}

function trueRange(bar: OhlcvBar, prevClose: number): number {
  const hl = bar.high - bar.low;
  const hc = Math.abs(bar.high - prevClose);
  const lc = Math.abs(bar.low - prevClose);
  return Math.max(hl, hc, lc);
}

/** Simple average true range over the last `period` daily bars (oldest→newest). */
export function averageTrueRange(bars: OhlcvBar[], period = 14): number {
  if (bars.length < period + 1) return 0;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const bar = bars[i]!;
    const prevClose = bars[i - 1]!.close;
    sum += trueRange(bar, prevClose);
  }
  const atr = sum / period;
  return atr > 0 && Number.isFinite(atr) ? atr : 0;
}

function emptyPlan(extra: Partial<LiveTradePlan> = {}): LiveTradePlan {
  return {
    ready: false,
    entry_zone: { min: null, max: null, mid: null },
    stop: null,
    target1: null,
    target2: null,
    conviction_blocked: false,
    rr_to_target1: null,
    min_rr_for_conviction: null,
    rr_check_ok: null,
    rr_check_label: null,
    levels_need_adjustment: null,
    ...extra,
  };
}

export type ComputeLiveTradePlanResult = {
  trade_plan: LiveTradePlan;
  quote_symbol: string | null;
  as_of_ms: number | null;
  spot: number | null;
  atr: number | null;
};

function entryMidFromZone(plan: LiveTradePlan): number | null {
  const { min, max, mid } = plan.entry_zone;
  if (min != null && max != null && Number.isFinite(min) && Number.isFinite(max)) {
    return (min + max) / 2;
  }
  if (mid != null && Number.isFinite(mid)) return mid;
  return null;
}

/** Reward:risk to target1 from entry midpoint (null if geometry invalid). */
export function rewardRiskToTarget1(plan: LiveTradePlan, direction: Thesis["direction"]): number | null {
  if (!plan.ready || plan.stop == null || plan.target1 == null) return null;
  const entry = entryMidFromZone(plan);
  if (entry == null || !Number.isFinite(entry)) return null;
  if (direction === "short") {
    const risk = plan.stop - entry;
    const reward = entry - plan.target1;
    if (!(risk > 0) || !(reward > 0)) return null;
    return reward / risk;
  }
  if (direction === "long") {
    const risk = entry - plan.stop;
    const reward = plan.target1 - entry;
    if (!(risk > 0) || !(reward > 0)) return null;
    return reward / risk;
  }
  return null;
}

export function minRewardRiskForConviction(convictionPct: number): number | null {
  if (!Number.isFinite(convictionPct)) return null;
  if (convictionPct < 50) return null;
  if (convictionPct >= 70) return 2;
  return 1.5;
}

function attachConvictionRrFields(
  plan: LiveTradePlan,
  direction: Thesis["direction"],
  convictionPct: number | null | undefined,
): LiveTradePlan {
  if (convictionPct == null || !Number.isFinite(convictionPct)) {
    return { ...plan, rr_to_target1: null, min_rr_for_conviction: null, rr_check_ok: null, rr_check_label: null, levels_need_adjustment: null };
  }
  const minR = minRewardRiskForConviction(convictionPct);
  const rr = rewardRiskToTarget1(plan, direction);
  if (!plan.ready || minR == null) {
    return {
      ...plan,
      rr_to_target1: rr,
      min_rr_for_conviction: minR,
      rr_check_ok: null,
      rr_check_label: null,
      levels_need_adjustment: null,
    };
  }
  const ok = rr != null && rr + 1e-9 >= minR;
  const rrStr = rr != null ? `${rr.toFixed(2)}:1` : "—";
  const label = `R/R check · ${rrStr} (minimum ${minR}:1 for ${convictionPct >= 70 ? "≥70%" : "50–69%"} conviction)${ok ? "" : " — levels need adjustment"}`;
  return {
    ...plan,
    rr_to_target1: rr,
    min_rr_for_conviction: minR,
    rr_check_ok: ok,
    rr_check_label: label,
    levels_need_adjustment: !ok,
  };
}

/**
 * Builds estimated execution levels from the latest daily close and ATR(volatility).
 * Not a broker guarantee — same-session spot for coherence with DEPTH4 market-data feed.
 */
export function computeLiveTradePlan(args: {
  bars: OhlcvBar[];
  direction: Thesis["direction"];
  status: Thesis["status"];
  quoteSymbol: string;
  /** When set, enforces conviction bucket policy (min R/R, blocks entry when &lt;50%). */
  convictionPct?: number | null;
}): ComputeLiveTradePlanResult {
  const { bars, direction, status, quoteSymbol, convictionPct } = args;
  const quote_symbol = quoteSymbol;
  if (!bars.length) {
    return { trade_plan: emptyPlan(), quote_symbol, as_of_ms: null, spot: null, atr: null };
  }

  const last = bars[bars.length - 1]!;
  const spot = last.close;
  const as_of_ms = Number.isFinite(last.tsMs) ? last.tsMs : null;

  if (!Number.isFinite(spot) || spot <= 0) {
    return { trade_plan: emptyPlan(), quote_symbol, as_of_ms, spot: null, atr: null };
  }

  const atr = averageTrueRange(bars, 14);
  const actionableStatus = status === "ready" || status === "active";
  const directional = direction === "long" || direction === "short";
  const atrOk = atr > 0 && bars.length >= 15;

  if (convictionPct != null && Number.isFinite(convictionPct) && convictionPct < 50) {
    return {
      trade_plan: emptyPlan({
        conviction_blocked: true,
        rr_check_label: "Entry zone withheld — thesis conviction is below 50%.",
        rr_check_ok: false,
      }),
      quote_symbol,
      as_of_ms,
      spot,
      atr: atrOk ? atr : null,
    };
  }

  if (!actionableStatus || !directional || !atrOk) {
    return {
      trade_plan: emptyPlan(),
      quote_symbol,
      as_of_ms,
      spot,
      atr: atrOk ? atr : null,
    };
  }

  const kEntry = 0.1;
  const kBandLo = 0.4;
  const kBandHi = 0.3;
  const kStop = 1.35;
  const kT1 = 1.15;
  const kT2 = 2.25;

  let trade_plan: LiveTradePlan;

  if (direction === "long") {
    const mid = spot - kEntry * atr;
    const min = mid - kBandLo * atr;
    const max = mid + kBandHi * atr;
    const stop = spot - kStop * atr;
    const target1 = spot + kT1 * atr;
    const target2 = spot + kT2 * atr;
    trade_plan = {
      ready: true,
      entry_zone: { min, max, mid },
      stop,
      target1,
      target2,
    };
  } else {
    const mid = spot + kEntry * atr;
    const min = mid - kBandHi * atr;
    const max = mid + kBandLo * atr;
    const stop = spot + kStop * atr;
    const target1 = spot - kT1 * atr;
    const target2 = spot - kT2 * atr;
    trade_plan = {
      ready: true,
      entry_zone: { min, max, mid },
      stop,
      target1,
      target2,
    };
  }

  trade_plan = attachConvictionRrFields(trade_plan, direction, convictionPct);

  return {
    trade_plan,
    quote_symbol,
    as_of_ms,
    spot,
    atr,
  };
}
