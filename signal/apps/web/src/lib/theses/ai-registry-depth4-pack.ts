import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";
import { isAcceptableAiThesisRegistryHero } from "@/lib/theses/thesis-surfacing-quality";

/** Hero must bind to a catalyst window sharper than generic “someday”. */
const STRONG_TIMING_IN_HERO = new RegExp(
  [
    "\\bwithin weeks\\b",
    "\\bwithin days\\b",
    "\\bnext week\\b",
    "\\bwithin months\\b",
    "\\bthis earnings season\\b",
    "\\bthis year\\b",
    "\\bnext (one|two|three|four|\\d+) prints?\\b",
    "\\bnext payroll\\b",
    "\\bnext FOMC\\b",
    "\\bbefore (the )?(next )?(earnings|FOMC|payroll|revenue)\\b",
    "\\blonger than (the )?(market|futures)\\b",
    "\\baward dates\\b",
    "\\bchokepoint\\b",
    "\\block in(?: its)? order book\\b",
    "\\bover the next (few |several )?(weeks|months)\\b",
    "\\bover the next two quarters?\\b",
    "\\binto the summer\\b",
    "\\bsummer window\\b",
    "\\bthis quarter\\b",
    "\\bnext quarter\\b",
  ].join("|"),
  "i",
);

/** If "this year" appears, require an additional nearer-term hook (Part B). */
const NEARER_TIMING_HOOK = new RegExp(
  [
    "\\bwithin weeks\\b",
    "\\bwithin days\\b",
    "\\bwithin months\\b",
    "\\bthis earnings season\\b",
    "\\bnext (one|two|three|four|\\d+) prints?\\b",
    "\\bnext payroll\\b",
    "\\bnext FOMC\\b",
    "\\bbefore (the )?(next )?(earnings|FOMC|payroll|revenue)\\b",
    "\\blonger than (the )?(market|futures)\\b",
    "\\baward dates\\b",
    "\\bchokepoint\\b",
    "\\block in(?: its)? order book\\b",
    "\\bover the next (few |several )?(weeks|months)\\b",
    "\\bover the next two quarters?\\b",
    "\\binto the summer\\b",
    "\\bsummer window\\b",
    "\\bthis quarter\\b",
    "\\bnext quarter\\b",
    "\\bdelays?\\b",
    "\\bFed\\b",
  ].join("|"),
  "i",
);

/** Shallow sell-side / IR deck / headline-thesis phrasing — not a DEPTH4 registry hero. */
const ANALYST_DECK_HERO =
  /\b(Fair Value|Near Fair Value|Long-Term Targets|On Track|guidance reaffirmed|reaffirms guidance|PT raised|price target|Good Earnings|Strong Earnings|Earnings Beat|Earnings And Growth|Aggressive Campaign|We May Be Going|Shares Near)\b/i;

/** Forward causal hero: forecast cue + causal linker (Part B §5). */
const CAUSAL_HERO_PATTERN =
  /\b(will|should|to\s+fade|stay|bid|rerat|rerates?|re-?rate|grinds?|underperform|outperform|lag|rip)\b[\s\S]{0,220}\b(as|because|when|while|before|if|on|into)\b/i;

/** Mispricing / gap language (legacy helper + tests). */
const MISPRICING_SIGNAL = new RegExp(
  [
    "\\b(market|futures|tape|investors?|crowd|prices?|pricing|priced|embedded|expects?|still|yet|misses?|",
    "under-?pric|over-?pric|mispric|wrong|early|late|anchored|discount|premium|versus|vs\\.|depth4|",
    "not\\s+repric|has\\s+not|ignores?|unpriced|overpriced)\\b",
  ].join(""),
  "i",
);

/** Requires an explicit “what is priced vs what we see” style line (Part B §2). */
const SPECIFIC_MISPRICING = new RegExp(
  [
    "the\\s+market\\s+is\\s+pricing",
    "market\\s+is\\s+pricing",
    "depth4\\s+sees",
    "consensus\\s+(still\\s+)?(embed|price|assumes)",
    "futures\\s+(still\\s+)?(embed|price)",
    "priced\\s+for\\s+.{6,}",
    "mispric",
    "wrong\\s+about\\s+.{4,}",
    "still\\s+anchors",
    "embeds?\\s+too\\s+much",
  ].join("|"),
  "i",
);

const L34_GENERIC_FILLER =
  /\b(trend continues|broadly supportive|supportive backdrop|macro backdrop|fundamentals remain solid|secular growth story|tailwind persists|generally positive backdrop)\b/i;

const MIN_L1_L2_CHARS = 28;
const MIN_L3_L4_CHARS = 48;

/**
 * Uppercase tokens from the hero that match `[A-Z]{2,5}` but are not tradable equity roots
 * (prose, macro data tags, brand).
 */
const NOT_EQUITY_TICKER_TOKENS = new Set(
  [
    "THE",
    "AND",
    "FOR",
    "NOT",
    "BUT",
    "ALL",
    "CAN",
    "HAS",
    "WAS",
    "ARE",
    "OUR",
    "ANY",
    "OWN",
    "NEW",
    "OLD",
    "END",
    "SET",
    "RUN",
    "WIN",
    "LOSS",
    "RIP",
    "CEO",
    "CFO",
    "IPO",
    "ETF",
    "IT",
    "AS",
    "IF",
    "AT",
    "OR",
    "IN",
    "TO",
    "BY",
    "BE",
    "WE",
    "UK",
    "EU",
    "AI",
    "TV",
    "PC",
    "US",
    "MAY",
    "DAY",
    "TWO",
    "ONE",
    "TOP",
    "LOW",
    "BIG",
    "BAD",
    "CPI",
    "PPI",
    "GDP",
    "NFP",
    "ISM",
    "EIA",
    "ADP",
    "FED",
    "FOMC",
    "BOE",
    "BOJ",
    "ECB",
    "BOC",
    "RBA",
    "SNB",
    "IMF",
    "OPEC",
    "USD",
    "EUR",
    "JPY",
    "GBP",
    "CNY",
    "HKD",
    "TWD",
    "KRW",
    "INR",
    "BRL",
    "MXN",
    "CAD",
    "AUD",
    "NZD",
    "CHF",
    "SEK",
    "NOK",
    "DXY",
    "VIX",
    "SPX",
    "DEPTH4",
  ].map((s) => s.toUpperCase()),
);

/**
 * Part B §4 — hero must anchor on a macro-tradable expression (ETF, liquid future, large liquid single name,
 * sector basket, or explicit macro index / policy read without a stray micro-cap ticker).
 */
const MACRO_TRADABLE_HERO_ANCHOR = new RegExp(
  [
    "\\b(?:SPY|QQQ|IWM|DIA|VOO|VTI|EFA|EEM|FXI|EWJ|EWZ|IEFA|ACWI|VEA|VWO)\\b",
    "\\b(?:XLE|XLF|XLB|XLI|XLP|XLU|XLV|XLRE|XLK|XLY|XLC|SMH|SOXX|XBI|IBB|ARKK|ARKG|KWEB|TLT|IEF|SHY|LQD|HYG|JNK|EMB|TIP|GLD|SLV|IAU|USO|UNG|DBA|WEAT|CORN|SOYB)\\b",
    "\\b(?:\\/ES|\\/NQ|\\/YM|\\/RTY|\\/CL|\\/GC|\\/SI|\\/HG|\\/ZB|\\/ZN|\\/ZF|\\/ZT|\\/6E|\\/6J|\\/6B|\\/6A|\\/6C)\\b",
    "\\b(?:ES|NQ|YM|RTY|CL|GC|SI|HG|ZB|ZN)\\s+futures?\\b",
    "\\b(?:S&P|SPX|Nasdaq|Russell|Stoxx|MSCI)\\b",
    "\\b(?:WTI|Brent|crude|Treasur(?:y|ies)|UST|yield curve|real yields?|high yield|investment grade)\\b",
    "\\b(?:Fed|FOMC|ECB|BOJ|policy rate|terminal rate)\\b",
  ].join("|"),
  "i",
);

const MACRO_TRADABLE_TICKERS = new Set(
  [
    "SPY",
    "QQQ",
    "IWM",
    "DIA",
    "VOO",
    "VTI",
    "EFA",
    "EEM",
    "FXI",
    "EWJ",
    "EWZ",
    "IEFA",
    "ACWI",
    "VEA",
    "VWO",
    "XLE",
    "XLF",
    "XLB",
    "XLI",
    "XLP",
    "XLU",
    "XLV",
    "XLRE",
    "XLK",
    "XLY",
    "XLC",
    "SMH",
    "SOXX",
    "XBI",
    "IBB",
    "ARKK",
    "ARKG",
    "KWEB",
    "TLT",
    "IEF",
    "SHY",
    "LQD",
    "HYG",
    "JNK",
    "EMB",
    "TIP",
    "GLD",
    "SLV",
    "IAU",
    "USO",
    "UNG",
    "DBA",
    "WEAT",
    "CORN",
    "SOYB",
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "GOOG",
    "GOOGL",
    "META",
    "TSLA",
    "BRK",
    "JPM",
    "BAC",
    "GS",
    "MS",
    "WFC",
    "XOM",
    "CVX",
    "COP",
    "SLB",
    "OXY",
    "MPC",
    "VLO",
    "PSX",
    "CAT",
    "DE",
    "BA",
    "LMT",
    "RTX",
    "NOC",
    "DIS",
    "NFLX",
    "AMD",
    "INTC",
    "AVGO",
    "QCOM",
    "TXN",
    "MU",
    "AMAT",
    "LRCX",
    "KLAC",
    "ON",
    "COIN",
    "MSTR",
    "JNJ",
    "UNH",
    "LLY",
    "MRK",
    "ABBV",
    "PFE",
    "KO",
    "PEP",
    "WMT",
    "COST",
    "HD",
    "LOW",
    "NKE",
    "MCD",
    "SBUX",
    "PG",
    "PM",
    "MO",
    "BABA",
    "TSM",
    "ASML",
    "SAP",
    "NVO",
    "PLTR",
    "SNOW",
    "CRWD",
    "PANW",
    "NOW",
    "SHOP",
    "UBER",
    "ABNB",
    "BKNG",
    "MA",
    "V",
    "PYPL",
    "SQ",
    "BLK",
    "SCHW",
    "SPGI",
    "ICE",
    "CME",
    "MCO",
    "USB",
    "PNC",
    "TFC",
    "COF",
    "AXP",
    "IBM",
    "ORCL",
    "CRM",
    "ADBE",
    "SNPS",
    "CDNS",
    "ANET",
    "NET",
    "DDOG",
    "ZS",
    "FTNT",
    "RBLX",
    "ROKU",
    "F",
    "GM",
    "STLA",
    "TM",
    "HMC",
    "UPS",
    "FDX",
    "UNP",
    "CSX",
    "NSC",
    "DAL",
    "UAL",
    "AAL",
    "LUV",
    "GD",
    "HON",
    "MMM",
    "GE",
    "ETN",
    "EMR",
    "ITW",
    "PH",
    "ROK",
    "FCX",
    "NEM",
    "AA",
    "STLD",
    "NUE",
    "X",
    "CLF",
    "BTU",
    "CEG",
    "NEE",
    "DUK",
    "SO",
    "AEP",
    "SRE",
    "EXC",
    "PCG",
    "WMB",
    "KMI",
    "OKE",
    "LNG",
    "EOG",
    "PXD",
    "FANG",
    "DVN",
    "HAL",
    "BKR",
  ].map((s) => s.toUpperCase()),
);

function normalizeLevelBody(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function heroPassesMacroTradableAsset(hero: string): boolean {
  if (MACRO_TRADABLE_HERO_ANCHOR.test(hero)) return true;
  const raw = hero.match(/\b[A-Z]{2,5}\b/g) ?? [];
  const symbols = raw.map((t) => t.toUpperCase()).filter((t) => !NOT_EQUITY_TICKER_TOKENS.has(t));
  if (symbols.length === 0) return false;
  return symbols.every((t) => MACRO_TRADABLE_TICKERS.has(t));
}

export function extractReasoningLevelBodies(chain: string): string[] | null {
  const t = chain.trim();
  const hits: { n: number; start: number; headLen: number }[] = [];
  let m: RegExpExecArray | null;
  const re = /LEVEL\s*(\d)\s*\([^)]*\)\s*:/gi;
  while ((m = re.exec(t)) !== null) {
    hits.push({ n: Number.parseInt(m[1] ?? "0", 10), start: m.index, headLen: m[0].length });
  }
  if (hits.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    if (hits[i].n !== i + 1) return null;
  }
  const bodies: string[] = [];
  for (let i = 0; i < 4; i++) {
    const start = hits[i].start + hits[i].headLen;
    const end = i + 1 < 4 ? hits[i + 1].start : t.length;
    bodies.push(t.slice(start, end).replace(/\s+/g, " ").trim());
  }
  return bodies;
}

function levelEchoesHero(hero: string, level: string): boolean {
  const h = hero.replace(/\s+/g, " ").trim().toLowerCase();
  const L = level.replace(/\s+/g, " ").trim().toLowerCase();
  if (L.length < 24 || h.length < 24) return false;
  if (L.includes(h.slice(0, Math.min(48, h.length)))) return true;
  if (h.includes(L.slice(0, Math.min(48, L.length)))) return true;
  return false;
}

function timingPassesPartB(hero: string): { ok: true } | { ok: false; reason: string } {
  if (!STRONG_TIMING_IN_HERO.test(hero)) {
    return { ok: false, reason: "reject_hero_timing_too_vague" };
  }
  if (/\bthis year\b/i.test(hero)) {
    const stripped = hero.replace(/\bthis year\b/gi, " ");
    if (!NEARER_TIMING_HOOK.test(stripped)) {
      return { ok: false, reason: "reject_hero_timing_this_year_without_nearer_hook" };
    }
  }
  return { ok: true };
}

function combinedMispricingProbe(r: MacroEventReasoning, hero: string): string {
  return [hero, r.mispricing_hypothesis ?? "", r.thesis_trade_line ?? "", r.reasoning_summary ?? ""].join(" \n ");
}

export function hasExplicitMispricingSignal(r: MacroEventReasoning, hero: string): boolean {
  const pack = combinedMispricingProbe(r, hero);
  if (pack.length < 36) return false;
  return MISPRICING_SIGNAL.test(pack);
}

/** @deprecated Use {@link reasoningChainLevelsPassInsertBar}; kept for unit tests. */
export function reasoningChainHasSubstantiveL3L4(reasoningChain: string): boolean {
  const bodies = extractReasoningLevelBodies(reasoningChain);
  if (!bodies) return false;
  return bodies[2].length >= MIN_L3_L4_CHARS && bodies[3].length >= MIN_L3_L4_CHARS;
}

function reasoningChainLevelsPassInsertBar(chain: string, hero: string): { ok: true } | { ok: false; reason: string } {
  const bodies = extractReasoningLevelBodies(chain);
  if (!bodies) {
    return { ok: false, reason: "reject_reasoning_levels_incomplete" };
  }
  for (let i = 0; i < 4; i++) {
    const min = i < 2 ? MIN_L1_L2_CHARS : MIN_L3_L4_CHARS;
    if (bodies[i].length < min) {
      return { ok: false, reason: "reject_reasoning_levels_too_thin" };
    }
    if (levelEchoesHero(hero, bodies[i])) {
      return { ok: false, reason: "reject_reasoning_level_echoes_hero" };
    }
  }
  const norms = bodies.map(normalizeLevelBody);
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (norms[i].length >= 36 && norms[i] === norms[j]) {
        return { ok: false, reason: "reject_reasoning_level_duplicate_body" };
      }
    }
  }
  if (L34_GENERIC_FILLER.test(bodies[2]) || L34_GENERIC_FILLER.test(bodies[3])) {
    return { ok: false, reason: "reject_reasoning_l34_generic_filler" };
  }
  const mispriceSlice = `${bodies[2]} ${bodies[3]} ${hero}`;
  if (!SPECIFIC_MISPRICING.test(mispriceSlice)) {
    return { ok: false, reason: "reject_mispricing_not_specific" };
  }
  return { ok: true };
}

/**
 * Part B/C — full DEPTH4 validation before inserting **`public.theses`** (`ai_generated`).
 * On failure, callers keep output on `event_reasoning` / forming narrative only (no thesis row).
 */
export function passesAiThesisRegistryInsertValidation(p: {
  hero: string;
  reasoning: MacroEventReasoning;
}): { ok: true } | { ok: false; reason: string } {
  const hero = p.hero.trim();
  const chain = (p.reasoning.reasoning_chain ?? "").trim();

  if (!isAcceptableAiThesisRegistryHero(hero)) {
    return { ok: false, reason: "reject_registry_hero_base_bar" };
  }
  if (ANALYST_DECK_HERO.test(hero)) {
    return { ok: false, reason: "reject_analyst_style_hero" };
  }
  if (!CAUSAL_HERO_PATTERN.test(hero)) {
    return { ok: false, reason: "reject_hero_not_causal_forecast" };
  }

  if (!heroPassesMacroTradableAsset(hero)) {
    return { ok: false, reason: "reject_hero_not_macro_tradable_asset" };
  }

  const t = timingPassesPartB(hero);
  if (!t.ok) return t;

  if (!hasExplicitMispricingSignal(p.reasoning, hero)) {
    return { ok: false, reason: "reject_missing_explicit_mispricing_signal" };
  }

  const mh = (p.reasoning.mispricing_hypothesis ?? "").trim();
  if (!SPECIFIC_MISPRICING.test(`${chain} ${hero} ${mh}`)) {
    return { ok: false, reason: "reject_mispricing_not_specific" };
  }

  const levels = reasoningChainLevelsPassInsertBar(chain, hero);
  if (!levels.ok) return levels;

  return { ok: true };
}

/** Explicit name for Part B gate (same as {@link passesAiThesisRegistryInsertValidation}). */
export const validateMacroReasoningBeforeThesisInsert = passesAiThesisRegistryInsertValidation;

/** @deprecated Alias for {@link passesAiThesisRegistryInsertValidation}. */
export const passesAiThesisRegistryDepth4Pack = passesAiThesisRegistryInsertValidation;
