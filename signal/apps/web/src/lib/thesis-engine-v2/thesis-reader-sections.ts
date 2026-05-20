import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { primaryTradeSymbolFromThesis } from "@/lib/thesis-engine-v2/thesis-structured-anatomy";
import { thesisProseEquals } from "@/lib/thesis-engine-v2/thesis-text-utils";

export const READER_MARKET_MISREAD_FALLBACK =
  "DEPTH4 is analyzing what the market may be underpricing.";

export const READER_TRADE_FALLBACK =
  "Trade setup details are being refreshed as evidence lands.";

function norm(s: string): string {
  return s.trim();
}

/** Dedupe display labels like `CL.1 — CL.1` → `CL.1`. */
export function formatReaderTradeSymbol(thesis: Pick<Thesis, "asset" | "direction" | "insiderFlow">): string {
  const sym = primaryTradeSymbolFromThesis(thesis);
  const raw = norm(thesis.asset ?? "");
  if (!raw) return sym;
  const parts = raw
    .split(/\s*[—–-]\s*/)
    .map((p) => p.trim().toUpperCase())
    .filter((p) => p && p !== "—");
  const uniq = Array.from(new Set(parts));
  if (uniq.length === 1) return uniq[0]!;
  if (uniq.length > 1 && uniq.every((p) => p === uniq[0])) return uniq[0]!;
  if (sym && sym !== "—") return sym;
  return uniq[0] ?? sym;
}

export function readerThesisNarrative(thesis: Thesis): string {
  return norm(thesis.thesisStatement) || norm(thesis.oneLineSummary ?? "") || "";
}

export type ReaderMarketMisreadBlock =
  | { kind: "anatomy"; marketIsPricing: string; depth4Edge: string }
  | { kind: "single"; text: string }
  | { kind: "fallback" };

function pickDistinctMisreadCandidate(thesis: Thesis, statement: string): string | null {
  const anatomy = thesis.structuredAnatomy;
  const candidates = [
    norm(thesis.whatsUnpriced ?? ""),
    norm(thesis.incentiveAnalysis?.reasoning ?? ""),
    anatomy?.depth4_edge?.trim() ? norm(anatomy.depth4_edge) : "",
    anatomy?.market_is_pricing?.trim() ? norm(anatomy.market_is_pricing) : "",
    norm(thesis.marketMisread ?? ""),
    norm(thesis.tradeExpression ?? ""),
  ].filter(Boolean);

  for (const c of candidates) {
    if (thesisProseEquals(c, statement)) continue;
    if (anatomy?.market_is_pricing && thesisProseEquals(c, anatomy.market_is_pricing)) continue;
    return c;
  }
  return null;
}

export function readerMarketMisreadBlock(thesis: Thesis): ReaderMarketMisreadBlock {
  const statement = readerThesisNarrative(thesis);
  const anatomy = thesis.structuredAnatomy;
  const mip = norm(anatomy?.market_is_pricing ?? "");
  const edge = norm(anatomy?.depth4_edge ?? "");

  if (
    mip &&
    edge &&
    !thesisProseEquals(mip, edge) &&
    !thesisProseEquals(mip, statement) &&
    !thesisProseEquals(edge, statement)
  ) {
    return { kind: "anatomy", marketIsPricing: mip, depth4Edge: edge };
  }

  const single = pickDistinctMisreadCandidate(thesis, statement);
  if (single) return { kind: "single", text: single };

  return { kind: "fallback" };
}

export function readerTradeRationale(thesis: Thesis): string | null {
  const statement = readerThesisNarrative(thesis);
  const candidates = [
    norm(thesis.trade ?? ""),
    norm(thesis.tradeExpression ?? ""),
    norm(thesis.trigger ?? ""),
  ].filter(Boolean);

  for (const c of candidates) {
    if (thesisProseEquals(c, statement)) continue;
    if (formatReaderTradeSymbol(thesis) !== "—" && thesisProseEquals(c, formatReaderTradeSymbol(thesis))) continue;
    return c;
  }
  return null;
}
