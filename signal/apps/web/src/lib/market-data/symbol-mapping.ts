/**
 * Maps internal asset symbols to Twelve Data API symbols.
 * Centralized so all market data calls use the same mapping.
 */
export const TWELVE_DATA_SYMBOL_MAP: Record<string, string> = {
  "CL.1": "CL",
  "GC.1": "GC",
  "SI.1": "SI",
  "HG.1": "HG",
  XAUUSD: "XAU/USD",
  EURUSD: "EUR/USD",
  GBPUSD: "GBP/USD",
  USDJPY: "USD/JPY",
};

/**
 * Convert internal symbol to Twelve Data format.
 * Returns the mapped symbol or the original (trimmed) if no mapping exists.
 */
export function toTwelveDataSymbol(internalSymbol: string): string {
  const trimmed = internalSymbol.trim();
  if (!trimmed) return trimmed;
  const key = trimmed.toUpperCase();
  return TWELVE_DATA_SYMBOL_MAP[key] ?? trimmed;
}

/**
 * Convert Twelve Data symbol back to internal format.
 * Useful when processing API responses.
 */
export function fromTwelveDataSymbol(twelveDataSymbol: string): string {
  const td = twelveDataSymbol.trim();
  const entry = Object.entries(TWELVE_DATA_SYMBOL_MAP).find(([, v]) => v === td);
  return entry?.[0] ?? td;
}

/** True for forex/commodity symbols that trade outside US equity hours. */
export function isTwentyFourSevenTwelveDataSymbol(symbol: string): boolean {
  return toTwelveDataSymbol(symbol).includes("/");
}
