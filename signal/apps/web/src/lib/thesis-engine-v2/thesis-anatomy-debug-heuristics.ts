import type { Thesis, RelatedAsset } from "@/lib/thesis-engine-v2/types";
import {
  applyAnatomySemantics,
  primaryTradeSymbolFromThesis,
  type ThesisFourLevelSemantic,
  type ThesisStructuredAnatomy,
} from "@/lib/thesis-engine-v2/thesis-structured-anatomy";
import {
  anatomySemanticContextFromThesis,
  parseRawStructuredAnatomyFromBody,
  reconcileStructuredAnatomyFromBody,
} from "@/lib/thesis-engine-v2/thesis-db-body";

export const FOUR_LEVEL_TEMPLATE_PHRASES = [
  "You named the main driver",
  "the mechanism is how",
  "consensus is pricing",
  "what the tape is effectively pricing",
] as const;

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function textLengthChars(s: string): number {
  return norm(s).length;
}

export function containsTemplatePhrase(text: string): boolean {
  const t = text.toLowerCase();
  return FOUR_LEVEL_TEMPLATE_PHRASES.some((p) => t.includes(p.toLowerCase()));
}

export function isDistinctFromL1(levelText: string, l1: string): boolean {
  const a = norm(levelText).toLowerCase();
  const b = norm(l1).toLowerCase();
  if (!a || !b) return true;
  if (a === b) return false;
  if (a.length >= 36 && b.length >= 36 && (a.includes(b.slice(0, 48)) || b.includes(a.slice(0, 48)))) return false;
  return true;
}

export function stringsNearDuplicate(a: string, b: string): boolean {
  const na = norm(a).toLowerCase();
  const nb = norm(b).toLowerCase();
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (shorter.length >= 40 && longer.includes(shorter.slice(0, Math.min(48, shorter.length)))) return true;
  return false;
}

export function mentionsPrimaryTicker(text: string, ticker: string): boolean {
  const sym = ticker.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!sym || sym === "—") return false;
  return norm(text).toUpperCase().includes(sym);
}

const SYMBOL_READ_THROUGH_WORDS: Record<string, string[]> = {
  JETS: ["airline", "airlines", "jet fuel", "passenger"],
  CL: ["crude", "wti", "brent", "oil", "barrel", "opec"],
  USO: ["crude", "wti", "oil"],
  XLE: ["energy sector", "oil patch", "exploration"],
  SPY: ["s&p", "equities", "stocks", "index"],
};

export function isAssetSpecificMispricing(text: string, symbol: string): boolean {
  const body = norm(text);
  if (!body) return false;
  const sym = symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (sym && body.toUpperCase().includes(sym)) return true;
  const hints = SYMBOL_READ_THROUGH_WORDS[sym] ?? [];
  return hints.some((w) => body.toLowerCase().includes(w));
}

export function containsClEntryParagraph(text: string): boolean {
  const t = text.toLowerCase();
  return (
    (/\b(cl|wti|crude)\b/.test(t) && /\b(entry|stop|target|zone)\b/.test(t)) ||
    /\b\d{2,3}(\.\d+)?\s*(b\/bl|\/bbl|per barrel)\b/.test(t) ||
    /front[- ]month\s+(crude|oil|wti|cl)/i.test(text)
  );
}

export function containsTradeExpressionText(text: string): boolean {
  const t = text.toLowerCase();
  const hasSide = /\b(long|short|buy|sell|calls?|puts?)\b/.test(t);
  const hasPlan = /\b(entry|stop|target|invalidation|horizon)\b/.test(t);
  return hasSide && hasPlan;
}

export function inferAssetMapRole(biasLabel: string): string {
  const b = biasLabel.toLowerCase();
  if (b.includes("primary")) return "Primary";
  if (b.includes("hedge") || b.includes("defensive")) return "Hedge";
  if (b.includes("constructive") || b.includes("confirmation")) return "Confirmation";
  return "Read-through";
}

export type FourLevelDebugRow = {
  key: keyof ThesisFourLevelSemantic;
  label: string;
  text: string;
  lengthChars: number;
  distinctFromL1: boolean;
  containsTemplatePhrase: boolean;
};

export type MarketEdgeDebug = {
  market_is_pricing: string;
  depth4_edge: string;
  is_duplicate: boolean;
  market_length: number;
  edge_length: number;
  market_mentions_primary: boolean;
  edge_mentions_primary: boolean;
};

export type AssetMapDebugRow = {
  symbol: string;
  role: string;
  what_it_is_mispricing_preview: string;
  contains_CL_entry_paragraph: boolean;
  contains_trade_expression_text: boolean;
  is_asset_specific: boolean;
};

export type AnatomyDebugViewModel = {
  identity: {
    thesisId: string;
    slug: string;
    primaryAsset: string;
    primaryTicker: string;
    asset_family_raw: string | null;
    asset_family_reconciled: string | null;
    asset_family_changed: boolean;
  };
  rawAnatomy: ThesisStructuredAnatomy | null;
  reconciledAnatomy: ThesisStructuredAnatomy | null;
  uiAnatomy: ThesisStructuredAnatomy | null;
  reconciled_matches_ui: boolean;
  fourLevel: FourLevelDebugRow[];
  marketEdge: MarketEdgeDebug | null;
  assetMapRows: AssetMapDebugRow[];
  smellFlags: string[];
};

function fourLevelRows(fl: ThesisFourLevelSemantic): FourLevelDebugRow[] {
  const l1 = fl.level1_narrative;
  return [
    { key: "level1_narrative", label: "L1 narrative", text: l1, lengthChars: textLengthChars(l1), distinctFromL1: true, containsTemplatePhrase: containsTemplatePhrase(l1) },
    {
      key: "level2_mechanism",
      label: "L2 mechanism",
      text: fl.level2_mechanism,
      lengthChars: textLengthChars(fl.level2_mechanism),
      distinctFromL1: isDistinctFromL1(fl.level2_mechanism, l1),
      containsTemplatePhrase: containsTemplatePhrase(fl.level2_mechanism),
    },
    {
      key: "level3_mispricing",
      label: "L3 mispricing",
      text: fl.level3_mispricing,
      lengthChars: textLengthChars(fl.level3_mispricing),
      distinctFromL1: isDistinctFromL1(fl.level3_mispricing, l1),
      containsTemplatePhrase: containsTemplatePhrase(fl.level3_mispricing),
    },
    {
      key: "level4_resolution",
      label: "L4 resolution",
      text: fl.level4_resolution,
      lengthChars: textLengthChars(fl.level4_resolution),
      distinctFromL1: isDistinctFromL1(fl.level4_resolution, l1),
      containsTemplatePhrase: containsTemplatePhrase(fl.level4_resolution),
    },
  ];
}

function collectSmellFlags(args: {
  raw: ThesisStructuredAnatomy | null;
  reconciled: ThesisStructuredAnatomy | null;
  ui: ThesisStructuredAnatomy | null;
  fourLevel: FourLevelDebugRow[];
  marketEdge: MarketEdgeDebug | null;
  assetMapRows: AssetMapDebugRow[];
  primaryTicker: string;
}): string[] {
  const flags: string[] = [];
  if (!args.raw && !args.ui) flags.push("no_structured_anatomy");
  if (args.raw && args.reconciled && args.raw.asset_family !== args.reconciled.asset_family) {
    flags.push(`asset_family_reconciled:${args.raw.asset_family}→${args.reconciled.asset_family}`);
  }
  if (args.reconciled && args.ui && JSON.stringify(args.reconciled) !== JSON.stringify(args.ui)) {
    flags.push("reconciled_neq_ui_structuredAnatomy");
  }
  if (args.marketEdge?.is_duplicate) flags.push("market_is_pricing_duplicates_depth4_edge");
  for (const row of args.fourLevel) {
    if (row.key !== "level1_narrative" && !row.distinctFromL1) flags.push(`${row.key}_not_distinct_from_l1`);
    if (row.containsTemplatePhrase) flags.push(`${row.key}_template_phrase`);
  }
  if (args.marketEdge && !args.marketEdge.market_mentions_primary && args.primaryTicker) {
    flags.push("market_is_pricing_missing_primary_ticker");
  }
  if (args.marketEdge && !args.marketEdge.edge_mentions_primary && args.primaryTicker) {
    flags.push("depth4_edge_missing_primary_ticker");
  }
  for (const r of args.assetMapRows) {
    if (r.contains_CL_entry_paragraph && r.symbol.toUpperCase() !== "CL" && r.symbol.toUpperCase() !== "WTI") {
      flags.push(`${r.symbol}_cl_entry_paragraph_leak`);
    }
    if (!r.is_asset_specific) flags.push(`${r.symbol}_mispricing_not_asset_specific`);
  }
  return flags;
}

export type AssetEdgeRowInput = {
  symbol: string;
  biasLabel: string;
  mispriced: string;
};

export function buildAnatomyDebugViewModel(input: {
  thesis: Thesis;
  dbBody: unknown | null;
  assetEdgeRows: AssetEdgeRowInput[];
}): AnatomyDebugViewModel {
  const { thesis, dbBody, assetEdgeRows } = input;
  const raw = parseRawStructuredAnatomyFromBody(dbBody);
  const ctx = anatomySemanticContextFromThesis(thesis);
  const reconciled = raw ? applyAnatomySemantics(raw, ctx) : reconcileStructuredAnatomyFromBody(dbBody, thesis);
  const ui = thesis.structuredAnatomy ?? null;
  const primaryTicker = primaryTradeSymbolFromThesis(thesis);

  const flSource = reconciled?.four_level ?? ui?.four_level;
  const fourLevel = flSource ? fourLevelRows(flSource) : [];

  const marketEdgeSource = reconciled ?? ui;
  const marketEdge: MarketEdgeDebug | null = marketEdgeSource
    ? {
        market_is_pricing: marketEdgeSource.market_is_pricing,
        depth4_edge: marketEdgeSource.depth4_edge,
        is_duplicate: stringsNearDuplicate(marketEdgeSource.market_is_pricing, marketEdgeSource.depth4_edge),
        market_length: textLengthChars(marketEdgeSource.market_is_pricing),
        edge_length: textLengthChars(marketEdgeSource.depth4_edge),
        market_mentions_primary: mentionsPrimaryTicker(marketEdgeSource.market_is_pricing, primaryTicker),
        edge_mentions_primary: mentionsPrimaryTicker(marketEdgeSource.depth4_edge, primaryTicker),
      }
    : null;

  const assetMapRows: AssetMapDebugRow[] = assetEdgeRows.map((row) => {
    const mis = row.mispriced;
    return {
      symbol: row.symbol,
      role: inferAssetMapRole(row.biasLabel),
      what_it_is_mispricing_preview: mis.length > 160 ? `${mis.slice(0, 159)}…` : mis,
      contains_CL_entry_paragraph: containsClEntryParagraph(mis),
      contains_trade_expression_text: containsTradeExpressionText(mis),
      is_asset_specific: isAssetSpecificMispricing(mis, row.symbol),
    };
  });

  const identity = {
    thesisId: thesis.id,
    slug: thesis.slug,
    primaryAsset: thesis.asset,
    primaryTicker,
    asset_family_raw: raw?.asset_family ?? null,
    asset_family_reconciled: reconciled?.asset_family ?? ui?.asset_family ?? null,
    asset_family_changed: !!(raw && reconciled && raw.asset_family !== reconciled.asset_family),
  };

  const smellFlags = collectSmellFlags({
    raw,
    reconciled,
    ui,
    fourLevel,
    marketEdge,
    assetMapRows,
    primaryTicker,
  });

  return {
    identity,
    rawAnatomy: raw,
    reconciledAnatomy: reconciled,
    uiAnatomy: ui,
    reconciled_matches_ui: !!(reconciled && ui && JSON.stringify(reconciled) === JSON.stringify(ui)),
    fourLevel,
    marketEdge,
    assetMapRows,
    smellFlags,
  };
}
