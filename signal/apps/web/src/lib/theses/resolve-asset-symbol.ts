const PLACEHOLDER = new Set(["—", "-", "", "?"]);

const TITLE_TICKER_STOP = new Set([
  "THE",
  "AND",
  "FOR",
  "ARE",
  "BUT",
  "NOT",
  "YOU",
  "ALL",
  "CAN",
  "HER",
  "WAS",
  "ONE",
  "OUR",
  "OUT",
  "DAY",
  "GET",
  "HAS",
  "HIM",
  "HIS",
  "HOW",
  "ITS",
  "MAY",
  "NEW",
  "NOW",
  "OLD",
  "SEE",
  "WAY",
  "WHO",
  "WHY",
  "USD",
  "ETF",
  "API",
  "GDP",
  "CPI",
  "FOMC",
  "LONG",
  "SHORT",
]);

function normalizeSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (!s || PLACEHOLDER.has(s)) return null;
  return s.length > 12 ? s.split(/[\s—–-]/)[0]!.trim() || null : s;
}

function symbolFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  const fromTarget = normalizeSymbol(String(o.target_asset ?? o.targetAsset ?? ""));
  if (fromTarget) return fromTarget;
  return normalizeSymbol(String(o.asset ?? ""));
}

/** First plausible ticker in title (e.g. RTX, CL.1, XAUUSD). */
export function tickerFromTitle(title: string): string | null {
  const matches = title.match(/\b([A-Z]{2,5}(?:\.[A-Z0-9]{1,2})?)\b/g);
  if (!matches?.length) return null;
  for (const raw of matches) {
    const sym = normalizeSymbol(raw.replace(/\./g, "."));
    if (!sym) continue;
    const base = sym.split(".")[0]!;
    if (TITLE_TICKER_STOP.has(base)) continue;
    return sym;
  }
  return null;
}

/**
 * Display ticker for list/detail when `asset_symbol` or body target is missing.
 * Order: explicit symbol → title regex → body.target_asset → em dash.
 */
export function resolveAssetSymbol(input: {
  assetSymbol?: string | null;
  assetLabel?: string | null;
  title?: string | null;
  body?: unknown;
}): string {
  const fromColumn = normalizeSymbol(String(input.assetSymbol ?? ""));
  if (fromColumn) return fromColumn;

  const fromLabel = normalizeSymbol(String(input.assetLabel ?? ""));
  if (fromLabel) return fromLabel;

  const fromBody = symbolFromBody(input.body);
  if (fromBody) return fromBody;

  const fromTitle = tickerFromTitle(String(input.title ?? "").trim());
  if (fromTitle) return fromTitle;

  return "—";
}
