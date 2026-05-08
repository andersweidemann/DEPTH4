/** Yahoo Finance quote deep link for quick ticker drill-down (external). */
export function tickerQuoteUrl(symbol: string): string {
  const s = symbol.replace(/^\s+/, "").replace(/\s+$/, "").toUpperCase();
  const core = s.split(/[\s./]/)[0] ?? s;
  if (!core || !/^[\w^-]+$/.test(core)) return "#";
  return `https://finance.yahoo.com/quote/${encodeURIComponent(core)}`;
}
