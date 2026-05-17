/** Shared text helpers for anatomy reconciliation and asset-edge guards (Phase 3B.2). */

export function normText(s: string | null | undefined): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

export function firstSentence(s: string, maxLen = 220): string {
  const t = normText(s);
  if (!t) return "";
  const m = t.match(/^[^.!?]+[.!?]?/);
  const one = (m?.[0] ?? t).trim();
  if (!one.endsWith(".") && !one.endsWith("!") && !one.endsWith("?") && one.length < t.length) {
    return `${one}.`;
  }
  return one.length > maxLen ? `${one.slice(0, maxLen - 1)}…` : one;
}

export function stringsNearDuplicate(a: string, b: string): boolean {
  const na = normText(a).toLowerCase();
  const nb = normText(b).toLowerCase();
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (shorter.length >= 40 && longer.includes(shorter.slice(0, Math.min(48, shorter.length)))) return true;
  return false;
}

export const L2_META_TEMPLATE =
  /\b(you named the main driver|incoming headlines will test|your draft|will test whether it still holds)\b/i;

export function isL2MetaTemplate(text: string): boolean {
  return L2_META_TEMPLATE.test(normText(text));
}

export function containsClEntryParagraph(text: string): boolean {
  const t = normText(text).toLowerCase();
  return (
    (/\b(cl|wti|crude|brent|usoil)\b/.test(t) && /\b(entry|stop|target|zone|invalidation)\b/.test(t)) ||
    /\b\d{2,3}(\.\d+)?\s*(b\/bl|\/bbl|per barrel)\b/.test(t) ||
    /front[- ]month\s+(crude|oil|wti|cl)/i.test(text)
  );
}

export function containsTradeExpressionText(text: string): boolean {
  const t = normText(text).toLowerCase();
  const hasSide = /\b(long|short|buy|sell|calls?|puts?)\b/.test(t);
  const hasPlan = /\b(entry|stop|target|invalidation|horizon|zone)\b/.test(t);
  return hasSide && hasPlan;
}
