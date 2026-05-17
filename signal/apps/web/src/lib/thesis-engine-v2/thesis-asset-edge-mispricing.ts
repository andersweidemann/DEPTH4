import type { Thesis } from "@/lib/thesis-engine-v2/types";
import type { ThesisStructuredAnatomy } from "@/lib/thesis-engine-v2/thesis-structured-anatomy";
import { collectPrimaryTradeSymbols, primaryTradeSymbolFromThesis } from "@/lib/thesis-engine-v2/thesis-structured-anatomy";
import {
  containsClEntryParagraph,
  containsTradeExpressionText,
  normText,
} from "@/lib/thesis-engine-v2/thesis-text-similarity";

export type AssetEdgeRole = "Primary" | "Confirmation" | "Hedge" | "Read-through";

export type AssetMispricingBucket =
  | "crude_primary"
  | "energy_equity"
  | "defense"
  | "index"
  | "airline"
  | "macro_hedge"
  | "other";

const PRIMARY_CRUDE = new Set(["CL", "WTI", "USOIL", "BRENT", "USO", "BZ", "UKOIL"]);

export function normalizeAssetSymbol(s: string): string {
  return normText(s).replace(/\s+/g, "").toUpperCase();
}

export function isPrimaryCrudeSymbol(symbol: string): boolean {
  const s = normalizeAssetSymbol(symbol);
  return PRIMARY_CRUDE.has(s) || s === "USOIL" || /^CL\d/.test(s);
}

export function inferAssetMispricingBucket(symbol: string): AssetMispricingBucket {
  const s = normalizeAssetSymbol(symbol);
  if (isPrimaryCrudeSymbol(s)) return "crude_primary";
  if (/\b(XLE|OIH|XOP|XES|AMLP|VDE)\b/.test(s)) return "energy_equity";
  if (/\b(LMT|RTX|NOC|GD|ITA|HII|BA|LHX)\b/.test(s)) return "defense";
  if (/\b(JETS|DAL|UAL|AAL|LUV|ALK)\b/.test(s)) return "airline";
  if (/\b(SPY|QQQ|IWM|DIA|VOO|VTI|XLK|XLF|XLY|XLP|XLU|XLB|XLI|XLC|EEM|EFA)\b/.test(s)) return "index";
  if (/\b(UUP|TLT|IEF|SHY|GLD|XAUUSD|XAU|SLV|DXY|FXE|FXY)\b/.test(s)) return "macro_hedge";
  return "other";
}

export function inferAssetEdgeRole(symbol: string, thesis: Thesis, biasLabel?: string): AssetEdgeRole {
  const bl = (biasLabel ?? "").toLowerCase();
  if (bl.includes("primary")) return "Primary";
  if (bl.includes("hedge") || bl.includes("defensive")) return "Hedge";
  if (bl.includes("constructive") || bl.includes("confirmation")) return "Confirmation";
  const sym = normalizeAssetSymbol(symbol);
  const hero = normalizeAssetSymbol(thesis.asset === "—" ? "" : thesis.asset);
  const bulls = (thesis.insiderFlow?.bullInstruments ?? []).map(normalizeAssetSymbol);
  const bears = (thesis.insiderFlow?.bearInstruments ?? []).map(normalizeAssetSymbol);
  if (hero && sym === hero) return "Primary";
  if (bulls.includes(sym)) return "Confirmation";
  if (bears.includes(sym)) return "Hedge";
  return "Read-through";
}

/** True when copy looks like the hero crude trade plan pasted onto a non-crude row. */
export function isMispricingClTradeLeak(text: string, symbol: string, thesis: Thesis): boolean {
  if (isPrimaryCrudeSymbol(symbol)) return false;
  const body = normText(text);
  if (!body) return false;
  const hero = primaryTradeSymbolFromThesis(thesis);
  if (isPrimaryCrudeSymbol(hero) && containsClEntryParagraph(body)) return true;
  const tradeExpr = normText(thesis.tradeExpression);
  if (tradeExpr.length > 24 && body.length > 24) {
    const a = body.toLowerCase();
    const b = tradeExpr.toLowerCase();
    if (a === b || (b.length >= 48 && a.includes(b.slice(0, 48)))) return true;
  }
  if (containsTradeExpressionText(body) && /\b(cl|wti|crude|brent|usoil|front[- ]month)\b/i.test(body)) {
    return true;
  }
  return false;
}

function thesisLevelEdgeOneLiner(thesis: Thesis, anatomy?: ThesisStructuredAnatomy | null): string {
  const edge = normText(anatomy?.depth4_edge ?? thesis.whatsUnpriced ?? thesis.thesisStatement);
  if (edge.length > 28) return edge.length > 200 ? `${edge.slice(0, 199)}…` : edge;
  return "Thesis-level edge above — this row is a read-through on that view, not a repeat of the hero trade plan.";
}

function roleAwareMispricingTemplate(
  symbol: string,
  bucket: AssetMispricingBucket,
  role: AssetEdgeRole,
  thesis: Thesis,
  anatomy?: ThesisStructuredAnatomy | null,
): string {
  const sym = normalizeAssetSymbol(symbol);
  const family = anatomy?.asset_family ?? "other";
  const channel =
    family === "oil"
      ? "the oil shock channel"
      : family === "defense"
        ? "defense repricing"
        : family === "equity"
          ? "equity risk premium"
          : "the thesis channel";

  switch (bucket) {
    case "crude_primary":
      return `${sym} may still underprice supply risk, curve shape, and options skew versus how fast ${channel} is moving spot.`;
    case "energy_equity":
      return `${sym} can lag crude beta — earnings and multiples may reprice if oil stays elevated longer than consensus models.`;
    case "defense":
      return `${sym} backlog and procurement cadence may be underpriced versus a longer conflict premium in ${sym}.`;
    case "airline":
      return `${sym} margins may misprice sustained jet-fuel pass-through and demand sensitivity if oil stays bid on risk headlines.`;
    case "index":
      return `${sym} may not fully embed geopolitical risk premium and drawdown depth if ${channel} persists beyond a one-day headline.`;
    case "macro_hedge": {
      if (sym === "GLD" || sym === "XAU" || sym === "XAUUSD") {
        return `${sym} may underprice safe-haven bid versus growth hit if de-escalation is still embedded in the tape.`;
      }
      if (sym === "UUP" || sym === "DXY") {
        return `${sym} may misprice USD reaction — flight-to-safety vs growth drag can diverge from a one-factor risk-off read.`;
      }
      if (/\b(TLT|IEF|SHY|ZB|ZN)\b/.test(sym)) {
        return `${sym} duration may misprice how growth and risk-off trade against each other in this scenario.`;
      }
      return `${sym} may not yet reflect the macro hedge leg of ${channel}.`;
    }
    default:
      if (role === "Hedge") {
        return `${sym} hedge leg — watch whether defensive expression matches the thesis invalidation path.`;
      }
      return `${sym} read-through on ${channel} — positioning may lag the primary expression.`;
  }
}

/**
 * Resolve "What it's mispricing" for one asset row — prevents CL trade-plan leakage (Phase 3B.2).
 */
export function resolveAssetMispricingText(args: {
  symbol: string;
  thesis: Thesis;
  biasLabel: string;
  structuredMispriced?: string;
  /** First unstructured legacy row may use thesis-level edge once. */
  allowThesisLevelPrimary?: boolean;
  structuredAnatomy?: ThesisStructuredAnatomy | null;
}): string {
  const { symbol, thesis, biasLabel, structuredMispriced, allowThesisLevelPrimary, structuredAnatomy } = args;
  const sym = normalizeAssetSymbol(symbol);
  const role = inferAssetEdgeRole(symbol, thesis, biasLabel);
  const bucket = inferAssetMispricingBucket(symbol);
  const structured = normText(structuredMispriced);

  if (structured && !isMispricingClTradeLeak(structured, symbol, thesis)) {
    return structured.length > 280 ? `${structured.slice(0, 279)}…` : structured;
  }

  const hero = normalizeAssetSymbol(primaryTradeSymbolFromThesis(thesis));
  const wu = normText(thesis.whatsUnpriced);
  const tradeExpr = normText(thesis.tradeExpression);

  if (isPrimaryCrudeSymbol(sym) && (sym === hero || role === "Primary")) {
    if (wu.length > 24) return wu.length > 280 ? `${wu.slice(0, 279)}…` : wu;
    if (tradeExpr.length > 24 && isPrimaryCrudeSymbol(hero)) {
      return tradeExpr.length > 220 ? `${tradeExpr.slice(0, 219)}…` : tradeExpr;
    }
  }

  if (allowThesisLevelPrimary && role === "Primary" && wu.length > 24 && !isMispricingClTradeLeak(wu, symbol, thesis)) {
    return wu.length > 280 ? `${wu.slice(0, 279)}…` : wu;
  }

  if (tradeExpr && isMispricingClTradeLeak(tradeExpr, symbol, thesis)) {
    return roleAwareMispricingTemplate(sym, bucket, role, thesis, structuredAnatomy);
  }

  const stub = roleAwareMispricingTemplate(sym, bucket, role, thesis, structuredAnatomy);
  if (wu.length > 40 && !isMispricingClTradeLeak(wu, symbol, thesis) && !containsClEntryParagraph(wu)) {
    const hook = thesisLevelEdgeOneLiner(thesis, structuredAnatomy);
    if (hook.length > 24 && !containsClEntryParagraph(hook) && !containsTradeExpressionText(hook)) {
      const short = hook.length > 140 ? `${hook.slice(0, 139)}…` : hook;
      return `${sym} — ${short}`;
    }
  }
  return stub;
}

/** Symbols that may carry full crude trade expression text. */
export function crudeTradeExpressionSymbols(thesis: Thesis): Set<string> {
  const out = new Set<string>();
  for (const s of collectPrimaryTradeSymbols({
    asset: thesis.asset,
    bullInstruments: thesis.insiderFlow?.bullInstruments,
    bearInstruments: thesis.insiderFlow?.bearInstruments,
    direction: thesis.direction,
  })) {
    if (isPrimaryCrudeSymbol(s)) out.add(normalizeAssetSymbol(s));
  }
  return out;
}
