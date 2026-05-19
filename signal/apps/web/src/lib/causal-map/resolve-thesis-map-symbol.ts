import type { CausalAffect, ConflictWarning } from "@/types/causal-graph";

const PLACEHOLDER = new Set(["—", "-", ""]);

function firstSymbolFromText(text: string): string | null {
  const t = text.toLowerCase();
  if (/\b(xauusd|gold|gc\.1)\b/.test(t)) return "XAUUSD";
  if (/\b(usoil|wti|crude|brent|cl\.1)\b/.test(t) || /\boil\b/.test(t)) return "USO";
  if (/\bdax\b/.test(t)) return "DAX";
  if (/\b(spx|s&p|spy)\b/.test(t)) return "SPY";
  if (/\b(tlt|treasury|duration)\b/.test(t)) return "TLT";
  if (/\b(xle|energy)\b/.test(t)) return "XLE";
  return null;
}

/** Resolve map card symbol when DB/catalog asset string is missing. */
export function resolveThesisMapSymbol(input: {
  assetLabel: string;
  body?: unknown;
  affects: CausalAffect[];
  title: string;
  statement?: string;
  slug?: string;
}): string {
  const label = input.assetLabel.trim();
  if (label && !PLACEHOLDER.has(label)) {
    const sym = label.length > 12 ? label.split(/[\s—–-]/)[0]!.trim() : label;
    if (sym && !PLACEHOLDER.has(sym)) return sym.toUpperCase();
  }

  if (input.body && typeof input.body === "object" && !Array.isArray(input.body)) {
    const body = input.body as Record<string, unknown>;
    const fromBody = String(body.target_asset ?? body.targetAsset ?? "").trim();
    if (fromBody && !PLACEHOLDER.has(fromBody)) return fromBody.toUpperCase();
  }

  const dedicated = input.affects.find((a) => a.hasDedicatedThesis && a.assetSymbol);
  if (dedicated?.assetSymbol) return dedicated.assetSymbol.toUpperCase();

  const strongest = [...input.affects].sort((a, b) => b.mispricingScore - a.mispricingScore)[0];
  if (strongest?.assetSymbol) return strongest.assetSymbol.toUpperCase();

  const haystack = `${input.title} ${input.statement ?? ""} ${input.slug ?? ""}`;
  const inferred = firstSymbolFromText(haystack);
  if (inferred) return inferred;

  return "—";
}

/** Opposing directions on the same asset within a list (e.g. isolated oil theses). */
export function computeIsolatedConflictWarnings(theses: Array<{ id: string; title: string; targetAssetSymbol: string; direction: "up" | "down" }>): ConflictWarning[] {
  const byAsset = new Map<string, typeof theses>();
  for (const t of theses) {
    const key = t.targetAssetSymbol.toUpperCase();
    if (key === "—" || !key) continue;
    const list = byAsset.get(key) ?? [];
    list.push(t);
    byAsset.set(key, list);
  }

  const warnings: ConflictWarning[] = [];
  for (const list of Array.from(byAsset.values())) {
    if (list.length < 2) continue;
    const hasUp = list.some((t) => t.direction === "up");
    const hasDown = list.some((t) => t.direction === "down");
    if (!hasUp || !hasDown) continue;
    warnings.push({
      thesisA: list[0]!.title,
      thesisB: list[1]!.title,
      conflict: `Opposing directions on ${list[0]!.targetAssetSymbol}: ${list.map((t) => t.title).join(" vs ")}.`,
    });
  }
  return warnings;
}

export function thesisIdsInIsolatedConflicts(
  theses: Array<{ id: string; title: string; targetAssetSymbol: string; direction: "up" | "down" }>,
): Set<string> {
  const warnings = computeIsolatedConflictWarnings(theses);
  const ids = new Set<string>();
  for (const w of warnings) {
    for (const t of theses) {
      if (t.title === w.thesisA || t.title === w.thesisB) ids.add(t.id);
    }
  }
  return ids;
}
