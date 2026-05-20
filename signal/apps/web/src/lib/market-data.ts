import {
  isTwentyFourSevenTwelveDataSymbol,
  toTwelveDataSymbol,
} from "@/lib/market-data/symbol-mapping";

export {
  fromTwelveDataSymbol,
  toTwelveDataSymbol,
  TWELVE_DATA_SYMBOL_MAP,
  isTwentyFourSevenTwelveDataSymbol,
} from "@/lib/market-data/symbol-mapping";

export type OhlcvBar = {
  tsMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketSnapshot = {
  symbol: string;
  return_1m: number;
  return_5m: number;
  return_15m: number;
  volume_30m: number;
  baseline_volume_30m: number;
  volume_multiple: number;
  z_score: number;
};

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

function provider() {
  return (process.env.MARKET_DATA_PROVIDER ?? "twelve_data").trim();
}

function key() {
  return (process.env.MARKET_DATA_API_KEY ?? "").trim();
}

export type TwelveRateLimit = {
  limit?: number;
  remaining?: number;
  reset?: number;
};

export type TwelveBatchResult = {
  barsBySymbol: Record<string, OhlcvBar[]>;
  errorsBySymbol: Record<string, { status: string; message?: string }>;
  rateLimit: TwelveRateLimit;
  creditsUsed: number;
  httpStatus: number;
};

function parseRateLimitHeaders(h: Headers): TwelveRateLimit {
  const num = (k: string) => {
    const v = h.get(k);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    limit: num("X-RateLimit-Limit"),
    remaining: num("X-RateLimit-Remaining"),
    reset: num("X-RateLimit-Reset"),
  };
}

function isUsMarketHoursNow(): boolean {
  // Avoid adding a timezone dependency in the cron route; use Intl.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = get("weekday"); // Mon..Sun
  const hh = Number(get("hour"));
  const mm = Number(get("minute"));
  const dayOk = wd === "Mon" || wd === "Tue" || wd === "Wed" || wd === "Thu" || wd === "Fri";
  if (!dayOk || !Number.isFinite(hh) || !Number.isFinite(mm)) return false;

  // 09:30–16:00 ET
  const mins = hh * 60 + mm;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

function isAlwaysOnInstrument(symbol: string) {
  return isTwentyFourSevenTwelveDataSymbol(symbol);
}

function normalizeSymbol(sym: string) {
  return toTwelveDataSymbol(sym);
}

async function fetchTwelveDataBars(symbol: string, interval: "1min" | "5min" | "1day", outputsize: number): Promise<OhlcvBar[]> {
  const apiKey = key();
  if (!apiKey) return [];
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", String(outputsize));
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("format", "JSON");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return [];
  const j = (await res.json().catch(() => null)) as
    | { values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }>; status?: string }
    | null;
  const vals = j?.values;
  if (!Array.isArray(vals) || !vals.length) return [];

  const bars: OhlcvBar[] = [];
  for (const v of vals) {
    const ts = Date.parse(v.datetime);
    const open = Number(v.open);
    const high = Number(v.high);
    const low = Number(v.low);
    const close = Number(v.close);
    const volume = Number(v.volume ?? "0");
    if (!Number.isFinite(ts) || !Number.isFinite(close)) continue;
    bars.push({ tsMs: ts, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 });
  }
  // Twelve Data returns newest-first; normalize oldest-first for calculations
  bars.sort((a, b) => a.tsMs - b.tsMs);
  return bars;
}

function barsToSnapshot(symbol: string, bars: OhlcvBar[], baselineVol30m: number | null, volatility30d: number | null): MarketSnapshot | null {
  if (bars.length < 2) return null;
  const last = bars[bars.length - 1]!;
  const b1 = bars[Math.max(0, bars.length - 2)]!;
  const b5 = bars[Math.max(0, bars.length - 2)]!; // 5m interval: 1 bar ~= 5m
  const b15 = bars[Math.max(0, bars.length - 4)]!; // 3 bars back ~= 15m

  const ret1 = pctChange(b1.close, last.close); // for 5m data, this is actually 5m; kept for compatibility
  const ret5 = pctChange(b5.close, last.close);
  const ret15 = pctChange(b15.close, last.close);

  // 30m volume: sum last 6 bars of 5m interval
  const last6 = bars.slice(Math.max(0, bars.length - 6));
  const vol30 = last6.reduce((s, b) => s + (b.volume || 0), 0);

  const baseline = baselineVol30m && baselineVol30m > 0 ? baselineVol30m : Math.max(1, vol30);
  const volMult = baseline > 0 ? vol30 / baseline : 1;

  // z-score using cached 30d volatility (daily). Fallback to local std if missing.
  const sigma = volatility30d && volatility30d > 0 ? volatility30d : (() => {
    const rets: number[] = [];
    for (let i = 1; i < bars.length; i++) rets.push(pctChange(bars[i - 1]!.close, bars[i]!.close));
    return std(rets) || 0.0001;
  })();
  const z = ret15 / (sigma || 0.0001);

  return {
    symbol,
    return_1m: ret1,
    return_5m: ret5,
    return_15m: ret15,
    volume_30m: vol30,
    baseline_volume_30m: baseline,
    volume_multiple: volMult,
    z_score: z,
  };
}

export async function fetchTwelveDataBatch(symbolsRaw: string[], opts?: { interval?: "5min" | "1day"; outputsize?: number }) {
  const apiKey = key();
  if (!apiKey) {
    const out: TwelveBatchResult = { barsBySymbol: {}, errorsBySymbol: {}, rateLimit: {}, creditsUsed: 0, httpStatus: 0 };
    return out;
  }
  const prov = provider();
  if (prov !== "twelve_data") {
    const out: TwelveBatchResult = { barsBySymbol: {}, errorsBySymbol: {}, rateLimit: {}, creditsUsed: 0, httpStatus: 0 };
    return out;
  }

  const interval = opts?.interval ?? "5min";
  const outputsize = opts?.outputsize ?? 5;

  // Market hours optimization: skip stock/ETF requests outside US market hours.
  const inHours = isUsMarketHoursNow();
  const symbols = symbolsRaw
    .map(normalizeSymbol)
    .filter(Boolean)
    .filter((s) => (inHours ? true : isAlwaysOnInstrument(s)));

  if (!symbols.length) {
    const out: TwelveBatchResult = { barsBySymbol: {}, errorsBySymbol: {}, rateLimit: {}, creditsUsed: 0, httpStatus: 200 };
    return out;
  }

  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbols.join(","));
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", String(outputsize));
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("format", "JSON");

  const res = await fetch(url.toString(), { cache: "no-store" });
  const rateLimit = parseRateLimitHeaders(res.headers);

  if (res.status === 429) {
    return {
      barsBySymbol: {},
      errorsBySymbol: Object.fromEntries(symbols.map((s) => [s, { status: "error", message: "rate_limited" }])),
      rateLimit,
      creditsUsed: 0,
      httpStatus: 429,
    };
  }

  const body = (await res.json().catch(() => null)) as unknown;
  const barsBySymbol: Record<string, OhlcvBar[]> = {};
  const errorsBySymbol: Record<string, { status: string; message?: string }> = {};

  // Single-symbol format: { meta, values }
  const asSingle = body as {
    meta?: { symbol?: unknown };
    values?: Array<{ datetime?: unknown; open?: unknown; high?: unknown; low?: unknown; close?: unknown; volume?: unknown }>;
    status?: unknown;
    message?: unknown;
  } | null;
  if (asSingle && Array.isArray(asSingle.values) && asSingle.meta && typeof asSingle.meta === "object") {
    const sym = String(asSingle.meta.symbol ?? "").trim();
    if (sym) {
      barsBySymbol[sym] = (asSingle.values ?? [])
        .map((v) => {
          const ts = Date.parse(String(v.datetime ?? ""));
        return {
          tsMs: Number.isFinite(ts) ? ts : Date.now(),
          open: Number(v.open),
          high: Number(v.high),
          low: Number(v.low),
          close: Number(v.close),
          volume: Number(v.volume ?? "0") || 0,
        };
        })
        .filter((b: OhlcvBar) => Number.isFinite(b.close));
      barsBySymbol[sym].sort((a, b) => a.tsMs - b.tsMs);
    }
    return { barsBySymbol, errorsBySymbol, rateLimit, creditsUsed: symbols.length, httpStatus: res.status };
  }

  // Batch format: { "AAPL": {meta, values}, "TLT": {status:"error"...} }
  if (body && typeof body === "object" && !Array.isArray(body)) {
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      const sym = String(k).trim();
      const obj = v as {
        values?: Array<{ datetime?: unknown; open?: unknown; high?: unknown; low?: unknown; close?: unknown; volume?: unknown }>;
        status?: unknown;
        message?: unknown;
      } | null;
      if (!obj || typeof obj !== "object") continue;
      if (obj.status === "error") {
        errorsBySymbol[sym] = { status: "error", message: typeof obj.message === "string" ? obj.message : undefined };
        continue;
      }
      if (!Array.isArray(obj.values)) continue;
      const bars: OhlcvBar[] = [];
      for (const row of obj.values) {
        const ts = Date.parse(String(row.datetime ?? ""));
        const close = Number(row.close);
        if (!Number.isFinite(close)) continue;
        bars.push({
          tsMs: Number.isFinite(ts) ? ts : Date.now(),
          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close,
          volume: Number(row.volume ?? "0") || 0,
        });
      }
      bars.sort((a, b) => a.tsMs - b.tsMs);
      barsBySymbol[sym] = bars;
    }
  }

  return { barsBySymbol, errorsBySymbol, rateLimit, creditsUsed: symbols.length, httpStatus: res.status };
}

export async function getMarketSnapshotsBatch(args: {
  symbols: string[];
  baselinesBySymbol: Record<string, { volatility_30d: number | null; baseline_volume_30m: number | null } | undefined>;
}) {
  const { symbols, baselinesBySymbol } = args;
  const batch = await fetchTwelveDataBatch(symbols, { interval: "5min", outputsize: 7 });
  const out: Record<string, MarketSnapshot | null> = {};
  for (const s0 of symbols) {
    const internalKey = s0.trim().toUpperCase();
    const tdSymbol = normalizeSymbol(s0);
    const bars = batch.barsBySymbol[tdSymbol] ?? [];
    const b = baselinesBySymbol[internalKey] ?? baselinesBySymbol[s0.trim()];
    out[internalKey] = barsToSnapshot(internalKey, bars, b?.baseline_volume_30m ?? null, b?.volatility_30d ?? null);
  }
  return { snapshots: out, meta: batch };
}

export async function getDailyBars(symbol: string) {
  return fetchTwelveDataBars(normalizeSymbol(symbol), "1day", 60);
}

export async function getIntraday5mBars(symbol: string, outputsize = 5000) {
  return fetchTwelveDataBars(normalizeSymbol(symbol), "5min", outputsize);
}

