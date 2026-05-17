/**
 * Phase 3A — runtime mechanism gate for event→thesis news updates.
 * Blocks weak tag/ticker matches from moving scenario probabilities; allows log-only rows.
 */

export const MECHANISM_GATE_STOP_LIST_TAGS = new Set([
  "news",
  "event",
  "events",
  "market",
  "markets",
  "macro",
  "headline",
  "update",
  "report",
  "world",
]);

export type ThesisAssetFamily = "rates" | "oil" | "crypto" | "defense" | "equity" | "other";

export type MechanismGateEvent = {
  headline: string;
  category: string | null;
  region: string | null;
  bodyText?: string | null;
  oneLineSummary?: string | null;
  rawJson?: unknown;
};

export type MechanismGateThesis = {
  title: string;
  bullInstruments: string[];
  bearInstruments: string[];
};

export type MechanismGateMatch = {
  matchText: string;
  confirmMatched: string[];
  contradictMatched: string[];
  tickerHits: string[];
  signalLevel: number;
};

export type MechanismGateBlockCode =
  | "broad_tag_only"
  | "no_mechanism_signal"
  | "ticker_only"
  | "category_mismatch"
  | "asset_family_mismatch";

export type MechanismGateResult = {
  allowed: boolean;
  logOnly: boolean;
  blockCode: MechanismGateBlockCode | null;
  blockDetail: string;
  mechanismReason: string | null;
  assetFamily: ThesisAssetFamily;
  mechanismSignals: string[];
};

const OIL_SYMBOLS = new Set(["USOIL", "WTI", "CL", "BNO", "USO", "XLE", "UCO"]);
const RATE_SYMBOLS = new Set(["TLT", "IEF", "SHY", "ZB", "ZN", "TMV", "TYA", "TBT"]);
const CRYPTO_SYMBOLS = new Set(["BTC", "ETH", "BITO", "IBIT", "GBTC", "COIN"]);
const DEFENSE_SYMBOLS = new Set(["LMT", "RTX", "NOC", "GD", "BA", "LHX", "NOC"]);

const OUT_OF_FAMILY_CATEGORIES = new Set([
  "entertainment",
  "culture",
  "sports",
  "lifestyle",
  "celebrity",
  "fashion",
  "music",
  "film",
  "tv",
]);

const CULTURE_NOISE_KEYWORDS = [
  "eurovision",
  "festival",
  "song contest",
  "concert",
  "celebrity",
  "grammy",
  "oscar",
  "red carpet",
  "box office",
  "streaming debut",
  "reality tv",
];

const RATES_MECHANISM_KEYWORDS = [
  "inflation",
  "cpi",
  "pce",
  "payroll",
  "jobs report",
  "fed ",
  "fomc",
  "ecb",
  "boe",
  "treasury",
  "auction",
  "yield",
  "yields",
  "rate hike",
  "rate cut",
  "term premium",
  "liquidity",
  "credit spread",
  "fiscal",
  "deficit",
  "labor market",
  "gdp",
  "growth outlook",
  "curve",
  "issuance",
  "duration",
  "real yield",
];

const OIL_MECHANISM_KEYWORDS = [
  "opec",
  "supply",
  "inventory",
  "eia",
  "sanction",
  "pipeline",
  "strait",
  "hormuz",
  "refinery",
  "shale",
  "capex",
  "tanker",
  "disruption",
  "production cut",
  "production increase",
  "demand shock",
  "spare capacity",
  "crude stock",
  "brent",
  "wti spread",
  "chokepoint",
];

const CRYPTO_MECHANISM_KEYWORDS = [
  "bitcoin",
  "btc",
  "ethereum",
  "crypto regulation",
  "sec ",
  "etf inflow",
  "etf outflow",
  "spot etf",
  "custody",
  "exchange failure",
  "halving",
  "stablecoin",
  "defi",
  "mining",
  "wallet",
  "enforcement",
];

const DEFENSE_MECHANISM_KEYWORDS = [
  "defense budget",
  "pentagon",
  "procurement",
  "backlog",
  "order book",
  "weapons",
  "missile",
  "fighter",
  "nato spending",
  "military aid",
  "escalation",
  "airstrike",
  "mobilization",
  "contract award",
  "program delay",
  "cancellation",
];

const EQUITY_MECHANISM_KEYWORDS = [
  "earnings",
  "guidance",
  "margin",
  "revenue",
  "antitrust",
  "dma",
  "regulation",
  "buyback",
  "capex",
  "ai ",
  "artificial intelligence",
  "valuation",
  "multiple",
  "liquidity regime",
  "concentration",
  "leadership",
  "profit warning",
  "beat",
  "miss",
];

const FAMILY_MECHANISM_KEYWORDS: Record<ThesisAssetFamily, string[]> = {
  rates: RATES_MECHANISM_KEYWORDS,
  oil: OIL_MECHANISM_KEYWORDS,
  crypto: CRYPTO_MECHANISM_KEYWORDS,
  defense: DEFENSE_MECHANISM_KEYWORDS,
  equity: EQUITY_MECHANISM_KEYWORDS,
  other: [
    ...RATES_MECHANISM_KEYWORDS.slice(0, 8),
    ...OIL_MECHANISM_KEYWORDS.slice(0, 6),
    ...EQUITY_MECHANISM_KEYWORDS.slice(0, 8),
  ],
};

const RATES_CATEGORY_HINTS = ["central bank", "monetary", "inflation", "rates", "treasury", "macro data", "labor"];
const OIL_CATEGORY_HINTS = ["energy", "oil", "commodity supply", "opec", "geopolitics energy"];
const CRYPTO_CATEGORY_HINTS = ["crypto", "digital asset", "regulation crypto"];
const DEFENSE_CATEGORY_HINTS = ["defense", "military", "geopolitics conflict", "aerospace"];
const EQUITY_CATEGORY_HINTS = ["earnings", "equity", "tech", "antitrust", "corporate"];

function normTag(t: string): string {
  return t.trim().toLowerCase();
}

export function isMechanismGateStopListTag(tag: string): boolean {
  return MECHANISM_GATE_STOP_LIST_TAGS.has(normTag(tag));
}

function normSym(s: string): string {
  return String(s ?? "")
    .trim()
    .split(".", 1)[0]
    .toUpperCase();
}

export function inferThesisAssetFamily(thesis: MechanismGateThesis): ThesisAssetFamily {
  const syms = new Set(
    [...thesis.bullInstruments, ...thesis.bearInstruments].map((x) => normSym(String(x))).filter(Boolean),
  );
  const title = thesis.title.toLowerCase();

  if (Array.from(syms).some((s) => RATE_SYMBOLS.has(s)) || /\b(tlt|treasury|duration|rates|fed|yield|term premium)\b/.test(title)) {
    return "rates";
  }
  if (Array.from(syms).some((s) => OIL_SYMBOLS.has(s)) || /\b(oil|crude|wti|opec|strait|hormuz|brent)\b/.test(title)) {
    return "oil";
  }
  if (Array.from(syms).some((s) => CRYPTO_SYMBOLS.has(s)) || /\b(btc|bitcoin|crypto|ethereum)\b/.test(title)) {
    return "crypto";
  }
  if (Array.from(syms).some((s) => DEFENSE_SYMBOLS.has(s)) || /\b(defense|aerospace|pentagon|nato spending)\b/.test(title)) {
    return "defense";
  }
  if (
    Array.from(syms).some((s) => ["META", "AAPL", "MSFT", "NVDA", "QQQ", "SPY", "AMZN", "GOOGL"].includes(s)) ||
    /\b(tech|multiple|mega-?cap|platform|earnings)\b/.test(title)
  ) {
    return "equity";
  }
  return "other";
}

function specificMatchedTags(confirmMatched: string[], contradictMatched: string[]): string[] {
  return [...confirmMatched, ...contradictMatched].filter((t) => !isMechanismGateStopListTag(t));
}

function textHasKeyword(hay: string, keywords: readonly string[]): string[] {
  const found: string[] = [];
  for (const kw of keywords) {
    if (hay.includes(kw)) found.push(kw.trim());
  }
  return found;
}

function categoryHintsForFamily(family: ThesisAssetFamily): string[] {
  switch (family) {
    case "rates":
      return RATES_CATEGORY_HINTS;
    case "oil":
      return OIL_CATEGORY_HINTS;
    case "crypto":
      return CRYPTO_CATEGORY_HINTS;
    case "defense":
      return DEFENSE_CATEGORY_HINTS;
    case "equity":
      return EQUITY_CATEGORY_HINTS;
    default:
      return [];
  }
}

function categoryAlignsWithFamily(category: string | null, family: ThesisAssetFamily): boolean {
  if (!category?.trim()) return false;
  const c = category.toLowerCase();
  return categoryHintsForFamily(family).some((hint) => c.includes(hint));
}

function hasCultureNoise(text: string, category: string | null): boolean {
  const cat = (category ?? "").toLowerCase();
  if (OUT_OF_FAMILY_CATEGORIES.has(cat)) return true;
  return CULTURE_NOISE_KEYWORDS.some((kw) => text.includes(kw));
}

function reasoningMetadataLink(rawJson: unknown, family: ThesisAssetFamily): boolean {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) return false;
  const o = rawJson as Record<string, unknown>;
  const keys = ["mechanism_link", "driver_path", "transmission", "thesis_driver", "driver"];
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim().length > 8) {
      const hay = v.toLowerCase();
      return textHasKeyword(hay, FAMILY_MECHANISM_KEYWORDS[family]).length > 0;
    }
  }
  return false;
}

function collectMechanismSignals(args: {
  match: MechanismGateMatch;
  event: MechanismGateEvent;
  family: ThesisAssetFamily;
}): string[] {
  const { match, event, family } = args;
  const hay = match.matchText.toLowerCase();
  const signals: string[] = [];

  const specificTags = specificMatchedTags(match.confirmMatched, match.contradictMatched);
  for (const t of specificTags) signals.push(`tag:${normTag(t)}`);

  const familyKw = textHasKeyword(hay, FAMILY_MECHANISM_KEYWORDS[family]);
  for (const kw of familyKw) signals.push(`keyword:${kw}`);

  if (categoryAlignsWithFamily(event.category, family)) {
    signals.push(`category:${(event.category ?? "").toLowerCase()}`);
  }

  if (match.tickerHits.length > 0) {
    const tickerHasMechanism =
      familyKw.length > 0 ||
      categoryAlignsWithFamily(event.category, family) ||
      specificTags.length > 0 ||
      reasoningMetadataLink(event.rawJson, family);
    if (tickerHasMechanism) {
      signals.push(`ticker:${match.tickerHits.join(",")}`);
    }
  }

  if (reasoningMetadataLink(event.rawJson, family)) {
    signals.push("reasoning_metadata");
  }

  return signals;
}

function broadTagOnlyMatch(confirmMatched: string[], contradictMatched: string[]): boolean {
  const all = [...confirmMatched, ...contradictMatched];
  if (!all.length) return false;
  return all.every((t) => isMechanismGateStopListTag(t));
}

function buildMechanismReason(args: {
  family: ThesisAssetFamily;
  event: MechanismGateEvent;
  signals: string[];
  confirmMatched: string[];
  contradictMatched: string[];
}): string {
  const hay = [
    args.event.headline,
    args.event.oneLineSummary ?? "",
    args.event.bodyText ?? "",
    args.event.category ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const specificTags = specificMatchedTags(args.confirmMatched, args.contradictMatched);

  if (args.family === "rates") {
    if (hay.includes("treasury") && (hay.includes("auction") || hay.includes("issuance"))) {
      return "Treasury auction/issuance supports higher long-end yields and term-premium pressure on duration.";
    }
    if (hay.includes("cpi") || hay.includes("inflation") || specificTags.some((t) => t.includes("cpi"))) {
      return "Inflation print reinforces sticky core CPI path and delayed Fed easing vs. futures pricing.";
    }
    if (hay.includes("fed") || hay.includes("fomc") || specificTags.some((t) => t.includes("fed"))) {
      return "Fed policy signal shifts the cutting-cycle path and keeps duration under pressure.";
    }
    if (hay.includes("payroll") || hay.includes("jobs report")) {
      return "Labor-market strength supports higher-for-longer rates and bearish duration positioning.";
    }
  }

  if (args.family === "oil") {
    if (hay.includes("opec")) {
      return "OPEC supply decision plus inventory backdrop reinforces a higher crude floor in the thesis.";
    }
    if (hay.includes("strait") || hay.includes("hormuz") || hay.includes("chokepoint")) {
      return "Transit/chokepoint risk tightens effective supply and supports front-month crude bid.";
    }
    if (hay.includes("sanction") || hay.includes("inventory")) {
      return "Supply-side shock or inventory draw reinforces upside skew in the oil balance thesis.";
    }
  }

  if (args.family === "crypto") {
    if (hay.includes("etf") || hay.includes("inflow")) {
      return "ETF flow and institutional access support the BTC adoption path in the thesis.";
    }
    if (hay.includes("regulation") || hay.includes("sec")) {
      return "Regulatory clarity/shift updates the institutional adoption and liquidity path for crypto.";
    }
  }

  if (args.family === "defense") {
    if (hay.includes("budget") || hay.includes("procurement") || hay.includes("contract")) {
      return "Defense budget/procurement signal supports backlog and demand for defense primes.";
    }
    if (hay.includes("escalation") || hay.includes("mobilization")) {
      return "Conflict escalation with procurement implications reinforces defense demand in the thesis.";
    }
  }

  if (args.family === "equity") {
    if (hay.includes("earnings") || hay.includes("guidance")) {
      return "Earnings/guidance revision shifts the multiple and margin path for the equity thesis.";
    }
    if (hay.includes("dma") || hay.includes("antitrust") || hay.includes("fine")) {
      return "EU/platform enforcement updates regulatory overhang on mega-cap tech multiples.";
    }
    if (hay.includes("ai ") || hay.includes("capex")) {
      return "AI capex/monetization narrative shifts growth-multiple regime for the tech thesis.";
    }
  }

  const tagHint = specificTags.slice(0, 2).join(", ");
  const kwHint = args.signals
    .filter((s) => s.startsWith("keyword:"))
    .map((s) => s.replace("keyword:", ""))
    .slice(0, 2)
    .join(", ");
  if (tagHint && kwHint) {
    return `Event transmission via ${tagHint} aligns with ${kwHint} drivers in the ${args.family} thesis.`;
  }
  if (tagHint) {
    return `Driver-aligned tags (${tagHint}) provide a credible transmission link to the thesis path.`;
  }
  if (kwHint) {
    return `Macro mechanism (${kwHint}) links the headline to the thesis driver set.`;
  }
  return `Credible ${args.family} mechanism signal links the event to the thesis driver path.`;
}

/**
 * Gate event→thesis movement at the boundary where a tag/ticker match would become an update.
 * Err on the side of no movement when ambiguous.
 */
export function evaluateThesisEventMechanismGate(args: {
  thesis: MechanismGateThesis;
  event: MechanismGateEvent;
  match: MechanismGateMatch;
}): MechanismGateResult {
  const family = inferThesisAssetFamily(args.thesis);
  const hay = args.match.matchText.toLowerCase();
  const signals = collectMechanismSignals({ match: args.match, event: args.event, family });

  const base: MechanismGateResult = {
    allowed: false,
    logOnly: true,
    blockCode: null,
    blockDetail: "",
    mechanismReason: null,
    assetFamily: family,
    mechanismSignals: signals,
  };

  const hasTagMatch = args.match.confirmMatched.length > 0 || args.match.contradictMatched.length > 0;
  const hasTickerMatch = args.match.tickerHits.length > 0 && args.match.signalLevel >= 3;
  if (!hasTagMatch && !hasTickerMatch) {
    return { ...base, logOnly: false, blockCode: "no_mechanism_signal", blockDetail: "No tag or ticker match" };
  }

  if (hasCultureNoise(hay, args.event.category) && family !== "other") {
    const familyKw = textHasKeyword(hay, FAMILY_MECHANISM_KEYWORDS[family]);
    if (familyKw.length === 0 && specificMatchedTags(args.match.confirmMatched, args.match.contradictMatched).length === 0) {
      return {
        ...base,
        blockCode: "category_mismatch",
        blockDetail: `Culture/entertainment event outside ${family} mechanism scope`,
      };
    }
  }

  if (hasTickerMatch && !hasTagMatch && signals.length === 0) {
    return {
      ...base,
      blockCode: "ticker_only",
      blockDetail: "Ticker hit alone is insufficient without a transmission mechanism",
    };
  }

  if (broadTagOnlyMatch(args.match.confirmMatched, args.match.contradictMatched) && signals.length === 0) {
    return {
      ...base,
      blockCode: "broad_tag_only",
      blockDetail: "Only broad stop-list tags matched with no mechanism signal",
    };
  }

  if (signals.length === 0) {
    if (broadTagOnlyMatch(args.match.confirmMatched, args.match.contradictMatched)) {
      return {
        ...base,
        blockCode: "broad_tag_only",
        blockDetail: "Broad tags matched but no driver/category/keyword mechanism found",
      };
    }
    return {
      ...base,
      blockCode: "no_mechanism_signal",
      blockDetail: "No minimal mechanism signal beyond generic overlap",
    };
  }

  if (family !== "other" && hasCultureNoise(hay, args.event.category)) {
    const familyKw = textHasKeyword(hay, FAMILY_MECHANISM_KEYWORDS[family]);
    if (familyKw.length === 0) {
      return {
        ...base,
        blockCode: "asset_family_mismatch",
        blockDetail: `Event theme does not align with ${family} driver families`,
      };
    }
  }

  const mechanismReason = buildMechanismReason({
    family,
    event: args.event,
    signals,
    confirmMatched: args.match.confirmMatched,
    contradictMatched: args.match.contradictMatched,
  });

  return {
    allowed: true,
    logOnly: false,
    blockCode: null,
    blockDetail: "",
    mechanismReason,
    assetFamily: family,
    mechanismSignals: signals,
  };
}
