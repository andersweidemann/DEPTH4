/**
 * Phase 3B — explicit thesis anatomy for mechanism-aware updates and 4-L integrity.
 * Stored in `public.theses.body.thesis_structured_anatomy` (additive JSON; no column migration).
 *
 * VISION alignment:
 * - L1: immediate claim / first-order narrative (confirmed, 0–24h)
 * - L2: mechanism / transmission path (1–7d)
 * - L3: mispricing — what consensus gets wrong (7–30d)
 * - L4: resolution / trade consequence over time (30–90d+)
 */

import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { extractReasoningLevelBodies } from "@/lib/theses/ai-registry-depth4-pack";

export const THESIS_STRUCTURED_ANATOMY_VERSION = 1 as const;

export type ThesisAnatomyAssetFamily =
  | "rates"
  | "oil"
  | "crypto"
  | "defense"
  | "equity"
  | "fx"
  | "commodities"
  | "other";

export type ThesisMispricingType =
  | "timing"
  | "path"
  | "resolution"
  | "magnitude"
  | "attention"
  | "policy_lag"
  | "flows"
  | "other";

export type ThesisDepthKeyAnatomy = "depth_1" | "depth_2" | "depth_3" | "depth_4";

/** Semantic 4-L roles — distinct from legacy `thesisCascade` timeline labels. */
export type ThesisFourLevelSemantic = {
  /** Level 1 — immediate claim / first-order market narrative */
  level1_narrative: string;
  /** Level 2 — mechanism / transmission path */
  level2_mechanism: string;
  /** Level 3 — mispricing: why consensus is wrong or incomplete */
  level3_mispricing: string;
  /** Level 4 — resolution path / trade implication over time */
  level4_resolution: string;
};

export type ThesisStructuredAnatomy = {
  schema_version: typeof THESIS_STRUCTURED_ANATOMY_VERSION;
  asset_family: ThesisAnatomyAssetFamily;
  primary_drivers: string[];
  secondary_drivers: string[];
  mechanism_keywords: string[];
  noise_categories: string[];
  mispricing_type: ThesisMispricingType;
  /** What the crowd / futures / tape is effectively pricing. */
  market_is_pricing: string;
  /** DEPTH4 edge — what we see differently (plain language). */
  depth4_edge: string;
  resolution_horizon: string;
  /** How the thesis resolves if right (path, not headline). */
  resolution_path: string;
  trade_implication: string;
  four_level: ThesisFourLevelSemantic;
  /** Where depth-selection edge lives (VISION depth-selection moat). */
  primary_mispriced_depth?: ThesisDepthKeyAnatomy;
  /** Events/tags that should matter for confirm paths. */
  confirm_signal_hints?: string[];
  /** Categories/tags treated as noise for this thesis. */
  generated_at?: string;
};

export type ThesisAnatomyValidationSeverity = "error" | "warning";

export type ThesisAnatomyValidationResult =
  | { ok: true; warnings: string[] }
  | { ok: false; reasons: string[]; warnings: string[]; severity: ThesisAnatomyValidationSeverity };

const GENERIC_DRIVER = new Set([
  "macro",
  "markets",
  "geopolitics",
  "headline risk",
  "uncertainty",
  "volatility",
  "sentiment",
  "risk-off",
  "risk on",
]);

const GENERIC_MISPRICING = /\b(market is wrong|could impact|remains to be seen|investors may reprice|sentiment shifts)\b/i;

const MISPRICING_EXPLICIT =
  /\b(market is (still )?pricing|market prices|crowd (still )?embed|futures (still )?price|priced for|mispric|under-?pric|over-?pric|consensus (still )?assumes|not pricing|unpriced)\b/i;

function norm(s: string | null | undefined): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function normList(raw: unknown, max = 8): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const t = norm(String(x ?? ""));
    if (!t) continue;
    if (out.some((o) => o.toLowerCase() === t.toLowerCase())) continue;
    out.push(t.slice(0, 120));
    if (out.length >= max) break;
  }
  return out;
}

/** Primary + expression tickers in trade-priority order (hero asset first). */
export function collectPrimaryTradeSymbols(args: {
  asset?: string | null;
  bullInstruments?: string[];
  bearInstruments?: string[];
  direction?: Thesis["direction"];
}): string[] {
  const out: string[] = [];
  const add = (raw: string) => {
    const t = norm(raw).toUpperCase();
    if (!t || t === "—" || t === "-") return;
    if (!out.includes(t)) out.push(t);
  };
  add(args.asset ?? "");
  const bulls = args.bullInstruments ?? [];
  const bears = args.bearInstruments ?? [];
  if (args.direction === "long") {
    bulls.forEach(add);
    bears.forEach(add);
  } else if (args.direction === "short") {
    bears.forEach(add);
    bulls.forEach(add);
  } else {
    [...bulls, ...bears].forEach(add);
  }
  return out;
}

function assetFamilyFromSymbol(sym: string): ThesisAnatomyAssetFamily | null {
  const s = norm(sym).toUpperCase();
  if (!s) return null;
  if (/\b(TLT|IEF|SHY|ZB|ZN|TMV)\b/.test(s)) return "rates";
  if (/\b(WTI|USOIL|CL|BRENT|XLE|USO)\b/.test(s)) return "oil";
  if (/\b(BTC|ETH|BITO|IBIT)\b/.test(s)) return "crypto";
  if (/\b(LMT|RTX|NOC|GD|ITA)\b/.test(s)) return "defense";
  if (/\b(SPY|QQQ|IWM|DIA|VOO|VTI|XLK|XLF|XLY|XLP|XLE|XLU|XLB|XLI|XLC|ARKK|META|NVDA|AAPL|MSFT|GOOGL|AMZN|TSLA|COIN)\b/.test(s)) {
    return "equity";
  }
  if (/\b(XAU|XAUUSD|GLD|HG|COPPER|GC|SI)\b/.test(s)) return "commodities";
  if (/\b(DXY|UUP|EURUSD|USDJPY|GBPUSD|FXE|FXY)\b/.test(s)) return "fx";
  return null;
}

function dominantSymbolFamily(symbols: string[]): ThesisAnatomyAssetFamily | null {
  const counts = new Map<ThesisAnatomyAssetFamily, number>();
  for (const sym of symbols) {
    const fam = assetFamilyFromSymbol(sym);
    if (!fam) continue;
    counts.set(fam, (counts.get(fam) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const heroFam = symbols[0] ? assetFamilyFromSymbol(symbols[0]) : null;
  if (heroFam && (counts.get(heroFam) ?? 0) >= 1) return heroFam;
  let best: ThesisAnatomyAssetFamily = "other";
  let bestN = 0;
  for (const [fam, n] of counts) {
    if (n > bestN) {
      best = fam;
      bestN = n;
    }
  }
  return best;
}

/** Symbol-first inference — narrative macro words (Fed, rates) must not override SPY/QQQ hero tickers. */
export function inferAssetFamilyFromSymbolsAndText(symbols: string[], text: string): ThesisAnatomyAssetFamily {
  const fromSymbols = dominantSymbolFamily(symbols);
  if (fromSymbols) return fromSymbols;

  const blob = `${symbols.join(" ")} ${text}`.toUpperCase();
  if (/\b(SPY|QQQ|IWM|DIA|EQUITY|STOCK|S&P|NASDAQ|EPS|EARNINGS)\b/.test(blob)) return "equity";
  if (/\b(TLT|IEF|SHY|ZB|ZN|TMV|RATES|DURATION|YIELD)\b/.test(blob)) return "rates";
  if (/\b(FED|FOMC|CPI|PCE|PAYROLL)\b/.test(blob) && !/\b(SPY|QQQ|STOCK|EQUITY)\b/.test(blob)) return "rates";
  if (/\b(WTI|USOIL|OIL|OPEC|CRUDE|BRENT|XLE|CL)\b/.test(blob)) return "oil";
  if (/\b(BTC|ETH|BITO|CRYPTO|BITCOIN)\b/.test(blob)) return "crypto";
  if (/\b(LMT|RTX|NOC|GD|ITA|DEFENSE|PENTAGON|NATO)\b/.test(blob)) return "defense";
  if (/\b(DXY|FX|EURUSD|EM FX)\b/.test(blob)) return "fx";
  if (/\b(GOLD|XAU|GLD|COPPER|HG|COMMOD)\b/.test(blob)) return "commodities";
  return "other";
}

/** Human label for the main trade expression on the thesis page. */
export function primaryTradeSymbolFromThesis(thesis: Pick<Thesis, "asset" | "direction" | "insiderFlow">): string {
  const symbols = collectPrimaryTradeSymbols({
    asset: thesis.asset,
    bullInstruments: thesis.insiderFlow?.bullInstruments,
    bearInstruments: thesis.insiderFlow?.bearInstruments,
    direction: thesis.direction,
  });
  return symbols[0] ?? (norm(thesis.asset).toUpperCase() || "—");
}

function stripMispricingLead(text: string): string {
  return norm(text).replace(/^the market is (still )?pricing\s+/i, "");
}

function buildMispricingPair(whats: string, stmt: string): { market_is_pricing: string; depth4_edge: string } {
  const wedge = whats.length > 24 ? whats : stmt;
  const market_is_pricing = ensureExplicitMispricingPhrase(
    whats.length > 24 ? whats : "the first-order headline more than the lagged transmission path",
  );
  let depth4_edge = wedge;
  const stripped = stripMispricingLead(wedge);
  if (stripped.length > 20 && stripped.toLowerCase() !== stripMispricingLead(market_is_pricing).toLowerCase()) {
    depth4_edge = stripped;
  } else if (stmt.length > 24 && stmt.toLowerCase() !== market_is_pricing.toLowerCase()) {
    depth4_edge = stmt;
  } else {
    depth4_edge =
      "The edge is in the lag between the headline and how positioning and flows actually reset — not in restating the obvious narrative.";
  }
  if (depth4_edge.toLowerCase() === market_is_pricing.toLowerCase()) {
    depth4_edge = stripped.length > 20 ? stripped : depth4_edge;
  }
  return { market_is_pricing, depth4_edge };
}

function buildDistinctFourLevel(input: {
  why: string;
  stmt: string;
  whats: string;
  trigger: string;
  target: string;
  trade: string;
  hiddenDriver?: string;
  likelyPath?: string;
  tradeExpression?: string;
  horizon?: string;
}): ThesisFourLevelSemantic {
  const l1 = norm(input.why) || norm(input.stmt);
  let l2 = norm(input.hiddenDriver) || norm(input.likelyPath) || norm(input.stmt);
  if (l2 && l1 && l2.slice(0, 48) === l1.slice(0, 48)) {
    l2 = "Transmission runs through flows and positioning once the catalyst in Why now confirms.";
  }
  const l3raw = norm(input.whats);
  const l3 =
    l3raw.length > 20
      ? l3raw
      : ensureExplicitMispricingPhrase("a cleaner path than the messy transmission DEPTH4 expects.");
  let l4 =
    norm(input.target) || norm(input.trade) || norm(input.tradeExpression) || norm(input.horizon);
  if (l4 && l3 && l4.slice(0, 40) === l3.slice(0, 40)) {
    l4 = norm(input.trigger) || norm(input.horizon) || l4;
  }
  return {
    level1_narrative: l1,
    level2_mechanism: l2,
    level3_mispricing: l3,
    level4_resolution: l4,
  };
}

export type AnatomySemanticContext = {
  asset?: string;
  direction?: Thesis["direction"];
  bullInstruments?: string[];
  bearInstruments?: string[];
  thesis_statement?: string;
  why_now?: string;
  whats_unpriced?: string;
  trigger_entry_setup?: string;
  target?: string;
  horizon?: string;
  trade?: string;
  hidden_driver?: string;
  likely_path?: string;
  trade_expression?: string;
};

/** Tighten LLM/heuristic anatomy: asset family, mispricing split, distinct 4-L. */
export function applyAnatomySemantics(
  anatomy: ThesisStructuredAnatomy,
  ctx: AnatomySemanticContext,
): ThesisStructuredAnatomy {
  const symbols = collectPrimaryTradeSymbols({
    asset: ctx.asset,
    bullInstruments: ctx.bullInstruments,
    bearInstruments: ctx.bearInstruments,
    direction: ctx.direction,
  });
  const text = [ctx.thesis_statement, ctx.why_now, ctx.whats_unpriced, ctx.trigger_entry_setup, ctx.target]
    .map((x) => String(x ?? ""))
    .join(" ");
  const stmt = norm(ctx.thesis_statement ?? "");
  const why = norm(ctx.why_now ?? "");
  const whats = norm(ctx.whats_unpriced ?? "");
  const mispricing = buildMispricingPair(whats, stmt);
  const four = buildDistinctFourLevel({
    why,
    stmt,
    whats,
    trigger: norm(ctx.trigger_entry_setup ?? ""),
    target: norm(ctx.target ?? ""),
    trade: norm(ctx.trade ?? ""),
    hiddenDriver: norm(ctx.hidden_driver ?? ""),
    likelyPath: norm(ctx.likely_path ?? ""),
    tradeExpression: norm(ctx.trade_expression ?? ""),
    horizon: norm(ctx.horizon ?? ""),
  });
  const pickLevel = (incoming: string, refined: string, minLen: number): string => {
    const inc = norm(incoming);
    if (inc.length < minLen) return refined;
    const rLow = refined.toLowerCase();
    const iLow = inc.toLowerCase();
    if (iLow === rLow || (rLow.length >= 40 && rLow.includes(iLow.slice(0, Math.min(48, iLow.length))))) {
      return refined;
    }
    return inc;
  };

  const flIn = anatomy.four_level;

  return {
    ...anatomy,
    asset_family: inferAssetFamilyFromSymbolsAndText(symbols, text),
    market_is_pricing: mispricing.market_is_pricing,
    depth4_edge:
      anatomy.depth4_edge.length > 24 && anatomy.depth4_edge.toLowerCase() !== mispricing.market_is_pricing.toLowerCase()
        ? stripMispricingLead(anatomy.depth4_edge) || mispricing.depth4_edge
        : mispricing.depth4_edge,
    trade_implication:
      norm(ctx.trigger_entry_setup ?? "") ||
      (anatomy.trade_implication.length > 12 ? anatomy.trade_implication : norm(ctx.trade_expression ?? "")),
    four_level: {
      level1_narrative: pickLevel(flIn.level1_narrative, four.level1_narrative, 28),
      level2_mechanism: pickLevel(flIn.level2_mechanism, four.level2_mechanism, 28),
      level3_mispricing: pickLevel(flIn.level3_mispricing, four.level3_mispricing, 40),
      level4_resolution: pickLevel(flIn.level4_resolution, four.level4_resolution, 40),
    },
    mispricing_type: inferMispricingType(`${mispricing.depth4_edge} ${whats}`),
  };
}

function mapCascadeToFourLevel(cascade: Thesis["thesisCascade"] | undefined): ThesisFourLevelSemantic | null {
  if (!cascade) return null;
  const l1 = norm(cascade.l1Confirmed);
  const l2 = norm(cascade.l2ThisQuarter);
  const l3 = norm(cascade.l3ThisYear);
  const l4 = norm(cascade.l4Backdrop2026);
  if (!l1 && !l2 && !l3 && !l4) return null;
  return {
    level1_narrative: l1,
    level2_mechanism: l2,
    level3_mispricing: l3,
    level4_resolution: l4,
  };
}

function mapReasoningBodiesToFourLevel(bodies: string[]): ThesisFourLevelSemantic {
  return {
    level1_narrative: bodies[0]?.slice(0, 900) ?? "",
    level2_mechanism: bodies[1]?.slice(0, 900) ?? "",
    level3_mispricing: bodies[2]?.slice(0, 900) ?? "",
    level4_resolution: bodies[3]?.slice(0, 900) ?? "",
  };
}

function ensureExplicitMispricingPhrase(text: string): string {
  const t = norm(text);
  if (!t) return "The market is still pricing the first-order headline more than the lagged transmission path.";
  if (MISPRICING_EXPLICIT.test(t)) return t;
  const rest = t.charAt(0).toLowerCase() + t.slice(1);
  return `The market is still pricing ${rest}`;
}

function inferMispricingType(text: string): ThesisMispricingType {
  const t = text.toLowerCase();
  if (/\b(timing|calendar|when|weeks|months|quarter|delay|longer than)\b/.test(t)) return "timing";
  if (/\b(path|sequence|messy|choppy|resolution|stand-?down)\b/.test(t)) return "path";
  if (/\b(magnitude|size|scale|volatility|move|rip|rally|selloff)\b/.test(t)) return "magnitude";
  if (/\b(attention|headline|priced in|already|crowd)\b/.test(t)) return "attention";
  if (/\b(rulemaking|lag|implementation|onboarding)\b/.test(t)) return "policy_lag";
  if (/\b(flow|etf|positioning|liquidity)\b/.test(t)) return "flows";
  return "other";
}

/** Parse unknown JSON from `body.thesis_structured_anatomy`. */
export function parseThesisStructuredAnatomy(raw: unknown): ThesisStructuredAnatomy | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const fl = o.four_level;
  if (!fl || typeof fl !== "object" || Array.isArray(fl)) return null;
  const f = fl as Record<string, unknown>;
  const four: ThesisFourLevelSemantic = {
    level1_narrative: norm(String(f.level1_narrative ?? "")),
    level2_mechanism: norm(String(f.level2_mechanism ?? "")),
    level3_mispricing: norm(String(f.level3_mispricing ?? "")),
    level4_resolution: norm(String(f.level4_resolution ?? "")),
  };
  const family = String(o.asset_family ?? "other").toLowerCase() as ThesisAnatomyAssetFamily;
  const validFamilies: ThesisAnatomyAssetFamily[] = [
    "rates",
    "oil",
    "crypto",
    "defense",
    "equity",
    "fx",
    "commodities",
    "other",
  ];
  return {
    schema_version: THESIS_STRUCTURED_ANATOMY_VERSION,
    asset_family: validFamilies.includes(family) ? family : "other",
    primary_drivers: normList(o.primary_drivers),
    secondary_drivers: normList(o.secondary_drivers),
    mechanism_keywords: normList(o.mechanism_keywords, 16),
    noise_categories: normList(o.noise_categories, 12),
    mispricing_type: (String(o.mispricing_type ?? "other") as ThesisMispricingType) || "other",
    market_is_pricing: norm(String(o.market_is_pricing ?? "")),
    depth4_edge: norm(String(o.depth4_edge ?? "")),
    resolution_horizon: norm(String(o.resolution_horizon ?? "")),
    resolution_path: norm(String(o.resolution_path ?? "")),
    trade_implication: norm(String(o.trade_implication ?? "")),
    four_level: four,
    primary_mispriced_depth: ["depth_1", "depth_2", "depth_3", "depth_4"].includes(String(o.primary_mispriced_depth))
      ? (String(o.primary_mispriced_depth) as ThesisDepthKeyAnatomy)
      : undefined,
    confirm_signal_hints: normList(o.confirm_signal_hints, 16),
    generated_at: typeof o.generated_at === "string" ? o.generated_at : undefined,
  };
}

function anatomyContextFromDraft(raw: Record<string, unknown>): AnatomySemanticContext {
  const inf =
    raw.insider_flow && typeof raw.insider_flow === "object" ? (raw.insider_flow as Record<string, unknown>) : {};
  return {
    asset: String(raw.asset ?? ""),
    direction: raw.direction === "short" ? "short" : raw.direction === "long" ? "long" : "watch",
    bullInstruments: Array.isArray(inf.bull_instruments)
      ? inf.bull_instruments.map((x) => String(x))
      : [],
    bearInstruments: Array.isArray(inf.bear_instruments)
      ? inf.bear_instruments.map((x) => String(x))
      : [],
    thesis_statement: String(raw.thesis_statement ?? ""),
    why_now: String(raw.why_now ?? ""),
    whats_unpriced: String(raw.whats_unpriced ?? ""),
    trigger_entry_setup: String(raw.trigger_entry_setup ?? ""),
    target: String(raw.target ?? ""),
    horizon: String(raw.horizon ?? ""),
  };
}

export function anatomyFromDraftPayload(raw: Record<string, unknown>): ThesisStructuredAnatomy | null {
  const ctx = anatomyContextFromDraft(raw);
  const nested = raw.thesis_structured_anatomy ?? raw.structured_anatomy;
  const parsed = parseThesisStructuredAnatomy(nested);
  if (parsed) return applyAnatomySemantics(parsed, ctx);

  const inf =
    raw.insider_flow && typeof raw.insider_flow === "object" ? (raw.insider_flow as Record<string, unknown>) : {};
  const mechanism_keywords = normList(
    [
      ...(Array.isArray(inf.confirm_tags) ? inf.confirm_tags : []),
      ...(Array.isArray(inf.contradict_tags) ? inf.contradict_tags : []),
    ],
    16,
  );
  const whats = norm(String(raw.whats_unpriced ?? ""));
  const why = norm(String(raw.why_now ?? ""));
  const stmt = norm(String(raw.thesis_statement ?? ""));
  const mispricing = buildMispricingPair(whats, stmt);
  const symbols = collectPrimaryTradeSymbols({
    asset: ctx.asset,
    bullInstruments: ctx.bullInstruments,
    bearInstruments: ctx.bearInstruments,
    direction: ctx.direction,
  });
  const text = [stmt, why, whats, ctx.trigger_entry_setup, ctx.target].join(" ");

  const shell: ThesisStructuredAnatomy = {
    schema_version: THESIS_STRUCTURED_ANATOMY_VERSION,
    asset_family: inferAssetFamilyFromSymbolsAndText(symbols, text),
    primary_drivers: normList([stmt.slice(0, 80), why.slice(0, 80)].filter((x) => x.length > 8)),
    secondary_drivers: normList([norm(String(raw.horizon ?? ""))]),
    mechanism_keywords,
    noise_categories: ["entertainment", "culture", "sports", "generic_macro_headline"],
    mispricing_type: inferMispricingType(`${whats} ${stmt}`),
    market_is_pricing: mispricing.market_is_pricing,
    depth4_edge: mispricing.depth4_edge,
    resolution_horizon: norm(String(raw.horizon ?? "weeks to quarters")),
    resolution_path: norm(String(raw.target ?? "")),
    trade_implication: norm(String(raw.trigger_entry_setup ?? "")),
    four_level: buildDistinctFourLevel({
      why,
      stmt,
      whats,
      trigger: norm(String(raw.trigger_entry_setup ?? "")),
      target: norm(String(raw.target ?? "")),
      trade: "",
      horizon: norm(String(raw.horizon ?? "")),
    }),
    primary_mispriced_depth: "depth_3",
    confirm_signal_hints: mechanism_keywords,
    generated_at: new Date().toISOString(),
  };
  return applyAnatomySemantics(shell, ctx);
}

export function buildAnatomyFromThesis(thesis: Thesis): ThesisStructuredAnatomy {
  const ctx: AnatomySemanticContext = {
    asset: thesis.asset,
    direction: thesis.direction,
    bullInstruments: thesis.insiderFlow?.bullInstruments,
    bearInstruments: thesis.insiderFlow?.bearInstruments,
    thesis_statement: thesis.thesisStatement,
    why_now: thesis.whyNow,
    whats_unpriced: thesis.whatsUnpriced,
    trigger_entry_setup: thesis.trigger,
    target: thesis.target1,
    horizon: thesis.horizon,
    trade: thesis.trade,
    hidden_driver: thesis.hiddenDriver,
    likely_path: thesis.likelyPath,
    trade_expression: thesis.tradeExpression,
  };
  if (thesis.structuredAnatomy) return applyAnatomySemantics(thesis.structuredAnatomy, ctx);

  const symbols = collectPrimaryTradeSymbols({
    asset: thesis.asset,
    bullInstruments: thesis.insiderFlow?.bullInstruments,
    bearInstruments: thesis.insiderFlow?.bearInstruments,
    direction: thesis.direction,
  });
  const text = [
    thesis.title,
    thesis.thesisStatement,
    thesis.whatsUnpriced,
    thesis.whyNow,
    thesis.trade,
    thesis.trigger,
  ].join(" ");

  const fourFromCascade = mapCascadeToFourLevel(thesis.thesisCascade);
  const mispricing = buildMispricingPair(norm(thesis.whatsUnpriced), norm(thesis.thesisStatement));
  const four =
    fourFromCascade ??
    buildDistinctFourLevel({
      why: thesis.whyNow,
      stmt: thesis.thesisStatement,
      whats: thesis.whatsUnpriced,
      trigger: thesis.trigger,
      target: thesis.target1 ?? "",
      trade: thesis.trade,
      hiddenDriver: thesis.hiddenDriver,
      likelyPath: thesis.likelyPath,
      tradeExpression: thesis.tradeExpression,
      horizon: thesis.horizon,
    });

  const shell: ThesisStructuredAnatomy = {
    schema_version: THESIS_STRUCTURED_ANATOMY_VERSION,
    asset_family: inferAssetFamilyFromSymbolsAndText(symbols, text),
    primary_drivers: normList([thesis.thesisStatement, thesis.hiddenDriver].filter(Boolean)),
    secondary_drivers: normList([thesis.likelyPath, thesis.theme].filter(Boolean)),
    mechanism_keywords: normList([
      ...(thesis.insiderFlow?.confirmTags ?? []),
      ...(thesis.insiderFlow?.contradictTags ?? []),
    ]),
    noise_categories: ["entertainment", "culture", "sports", "generic_macro_headline"],
    mispricing_type: inferMispricingType(`${thesis.whatsUnpriced} ${thesis.thesisStatement}`),
    market_is_pricing: thesis.marketMisread.trim()
      ? ensureExplicitMispricingPhrase(thesis.marketMisread)
      : mispricing.market_is_pricing,
    depth4_edge: mispricing.depth4_edge,
    resolution_horizon: norm(thesis.horizon),
    resolution_path: norm(thesis.likelyPath || thesis.trade),
    trade_implication: norm(thesis.tradeExpression || thesis.trade),
    four_level: four,
    primary_mispriced_depth: "depth_3",
    confirm_signal_hints: thesis.insiderFlow?.confirmTags ?? [],
    generated_at: new Date().toISOString(),
  };
  return applyAnatomySemantics(shell, ctx);
}

/** Mechanism hints from macro reasoning fields (no `confirm_tags` on {@link MacroEventReasoning}). */
function mechanismKeywordsFromMacroReasoning(r: MacroEventReasoning): string[] {
  const effectTokens = [...r.first_order_effects, ...r.second_order_effects]
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 4 && w.length <= 20);
  return normList(
    [
      ...r.impacted_assets,
      ...r.impacted_sectors,
      r.domain,
      r.direction_of_change,
      ...effectTokens,
    ],
    16,
  );
}

export function buildAnatomyFromMacroReasoning(args: {
  hero: string;
  reasoning: MacroEventReasoning;
  assetSymbols?: string[];
}): ThesisStructuredAnatomy {
  const hero = norm(args.hero);
  const r = args.reasoning;
  const mechanismKeywords = mechanismKeywordsFromMacroReasoning(r);
  const bodies = extractReasoningLevelBodies(r.reasoning_chain ?? "");
  const four = bodies
    ? mapReasoningBodiesToFourLevel(bodies)
    : {
        level1_narrative: norm(r.event_summary ?? hero),
        level2_mechanism: norm(r.reasoning_summary ?? hero),
        level3_mispricing: norm(r.mispricing_hypothesis ?? ""),
        level4_resolution: norm(r.thesis_trade_line ?? ""),
      };

  const symbols = args.assetSymbols ?? [];
  const family = inferAssetFamilyFromSymbolsAndText(symbols, `${hero} ${r.mispricing_hypothesis ?? ""}`);

  const shell: ThesisStructuredAnatomy = {
    schema_version: THESIS_STRUCTURED_ANATOMY_VERSION,
    asset_family: family,
    primary_drivers: normList([hero, r.event_summary ?? ""].filter(Boolean)),
    secondary_drivers: normList([r.reasoning_summary ?? ""].filter(Boolean)),
    mechanism_keywords: mechanismKeywords,
    noise_categories: ["entertainment", "culture", "sports", "celebrity", "generic_macro_headline"],
    mispricing_type: inferMispricingType(`${r.mispricing_hypothesis ?? ""} ${hero}`),
    market_is_pricing: ensureExplicitMispricingPhrase(
      r.mispricing_hypothesis?.split(".")[0] ?? "the first-order headline more than the lagged path",
    ),
    depth4_edge: norm(r.mispricing_hypothesis || hero),
    resolution_horizon: "weeks to quarters",
    resolution_path: norm(r.thesis_trade_line ?? ""),
    trade_implication: norm(r.thesis_trade_line ?? ""),
    four_level: four,
    primary_mispriced_depth: "depth_3",
    confirm_signal_hints: mechanismKeywords,
    generated_at: new Date().toISOString(),
  };
  return applyAnatomySemantics(shell, {
    asset: symbols[0],
    bullInstruments: symbols,
    thesis_statement: hero,
    whats_unpriced: r.mispricing_hypothesis ?? "",
    trade_expression: r.thesis_trade_line ?? "",
    target: r.thesis_trade_line ?? "",
  });
}

function levelBodiesTooSimilar(four: ThesisFourLevelSemantic): boolean {
  const norms = [
    norm(four.level1_narrative).toLowerCase(),
    norm(four.level2_mechanism).toLowerCase(),
    norm(four.level3_mispricing).toLowerCase(),
    norm(four.level4_resolution).toLowerCase(),
  ].filter((x) => x.length >= 36);
  for (let i = 0; i < norms.length; i++) {
    for (let j = i + 1; j < norms.length; j++) {
      if (norms[i] === norms[j]) return true;
      if (norms[i].length >= 48 && norms[i].includes(norms[j].slice(0, Math.min(48, norms[j].length)))) return true;
    }
  }
  return false;
}

/**
 * DEPTH4-specific anatomy validation — rejects headline shells and collapsed 4-L paraphrases.
 */
export function validateThesisStructuredAnatomy(
  anatomy: ThesisStructuredAnatomy,
  ctx?: { hero?: string; title?: string },
): ThesisAnatomyValidationResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const hero = norm(ctx?.hero ?? ctx?.title ?? "");
  const title = norm(ctx?.title ?? "");

  if (anatomy.primary_drivers.length === 0) {
    reasons.push("primary_drivers_empty");
  }
  for (const d of anatomy.primary_drivers) {
    if (GENERIC_DRIVER.has(d.toLowerCase())) {
      reasons.push("primary_driver_too_generic");
      break;
    }
  }

  const mispriceText = `${anatomy.market_is_pricing} ${anatomy.depth4_edge} ${anatomy.four_level.level3_mispricing}`;
  if (mispriceText.trim().length < 48) {
    reasons.push("mispricing_missing");
  } else if (!MISPRICING_EXPLICIT.test(mispriceText)) {
    reasons.push("mispricing_not_explicit");
  }
  if (GENERIC_MISPRICING.test(mispriceText)) {
    reasons.push("mispricing_generic_wording");
  }
  if (hero && title && anatomy.depth4_edge.toLowerCase() === hero.toLowerCase()) {
    reasons.push("mispricing_echoes_hero_only");
  }

  const minL = 28;
  const minL34 = 40;
  const fl = anatomy.four_level;
  if (fl.level1_narrative.length < minL) reasons.push("four_level_l1_thin");
  if (fl.level2_mechanism.length < minL) reasons.push("four_level_l2_thin");
  if (fl.level3_mispricing.length < minL34) reasons.push("four_level_l3_thin");
  if (fl.level4_resolution.length < minL34) reasons.push("four_level_l4_thin");
  if (levelBodiesTooSimilar(fl)) reasons.push("four_level_collapsed_paraphrase");

  if (!anatomy.resolution_path.trim() && !anatomy.trade_implication.trim()) {
    reasons.push("resolution_path_missing");
  }
  if (anatomy.trade_implication.length > 12 && anatomy.primary_drivers.length === 0) {
    reasons.push("trade_without_drivers");
  }

  if (anatomy.mechanism_keywords.length === 0) {
    warnings.push("mechanism_keywords_empty");
  }

  if (reasons.length > 0) {
    return { ok: false, reasons, warnings, severity: "error" };
  }
  return { ok: true, warnings };
}

/** Compact object for internal debug surfaces (Phase 3C). */
export function thesisAnatomyDebugSnapshot(anatomy: ThesisStructuredAnatomy) {
  return {
    asset_family: anatomy.asset_family,
    primary_drivers: anatomy.primary_drivers,
    mispricing_type: anatomy.mispricing_type,
    market_is_pricing: anatomy.market_is_pricing,
    depth4_edge: anatomy.depth4_edge,
    resolution_horizon: anatomy.resolution_horizon,
    primary_mispriced_depth: anatomy.primary_mispriced_depth,
    mechanism_keywords: anatomy.mechanism_keywords,
    noise_categories: anatomy.noise_categories,
    four_level_roles: {
      l1: anatomy.four_level.level1_narrative.slice(0, 200),
      l2: anatomy.four_level.level2_mechanism.slice(0, 200),
      l3: anatomy.four_level.level3_mispricing.slice(0, 200),
      l4: anatomy.four_level.level4_resolution.slice(0, 200),
    },
  };
}

export function anatomyToDbJson(anatomy: ThesisStructuredAnatomy): Record<string, unknown> {
  return { ...anatomy };
}
