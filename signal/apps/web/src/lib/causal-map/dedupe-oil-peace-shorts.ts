import type { CausalThesis } from "@/types/causal-graph";

const OIL_SYMBOLS = new Set(["CL.1", "CL", "WTI", "USO", "USOIL", "BRENT", "BZ"]);

const PEACE_DEFLATION_RE =
  /peace|ceasefire|premium|risk premium|de-escalat|deflation|war premium|middle east/i;

/** Live-map safety net: collapse duplicate WTI/CL peace-premium shorts in one cluster. */
export function isOilPeaceShortThesis(t: CausalThesis): boolean {
  if (t.direction !== "down") return false;
  if (!OIL_SYMBOLS.has(t.targetAssetSymbol.toUpperCase())) return false;
  const text = `${t.title} ${t.statement} ${t.slug}`.toLowerCase();
  return PEACE_DEFLATION_RE.test(text);
}

export function dedupeOilPeaceShortThesesInCluster(theses: CausalThesis[]): CausalThesis[] {
  const matches = theses.filter(isOilPeaceShortThesis);
  if (matches.length <= 1) return theses;
  const keep = matches.reduce((best, t) => (t.mispricingScore > best.mispricingScore ? t : best));
  const dropIds = new Set(matches.filter((t) => t.id !== keep.id).map((t) => t.id));
  return theses.filter((t) => !dropIds.has(t.id));
}
