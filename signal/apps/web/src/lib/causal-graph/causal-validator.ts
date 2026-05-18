import type { CausalEvent, CausalThesis } from "@/types/causal-graph";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export type ThesisLinkInput = Pick<
  CausalThesis,
  "title" | "statement" | "direction" | "targetAssetSymbol" | "slug"
>;

export type EventLinkInput = Pick<CausalEvent, "title" | "category" | "description">;

function normAsset(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\s+/g, "");
}

/** True when both symbols refer to the same tradable (exact or shared root token). */
export function sameTargetAsset(a: string, b: string): boolean {
  const x = normAsset(a);
  const y = normAsset(b);
  if (!x || !y || x === "—" || y === "—") return false;
  if (x === y) return true;
  const strip = (s: string) => s.replace(/[^A-Z0-9]/g, "");
  const sx = strip(x);
  const sy = strip(y);
  if (sx === sy) return true;
  if (sx.length >= 3 && sy.includes(sx)) return true;
  if (sy.length >= 3 && sx.includes(sy)) return true;
  return false;
}

export function validateThesisEventLink(
  thesis: ThesisLinkInput,
  event: EventLinkInput,
  existingClusterTheses: CausalThesis[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const thesisSlug = thesis.slug?.trim() || "";

  // Rule 1: directional contradiction on same asset within one event cluster
  const sameAssetThesis = existingClusterTheses.find(
    (t) =>
      sameTargetAsset(t.targetAssetSymbol, thesis.targetAssetSymbol) &&
      (thesisSlug ? t.slug !== thesisSlug : true),
  );
  if (sameAssetThesis && sameAssetThesis.direction !== thesis.direction) {
    errors.push(
      `Contradiction: Existing thesis "${sameAssetThesis.title}" expects ` +
        `${sameAssetThesis.targetAssetSymbol} ${sameAssetThesis.direction.toUpperCase()}, ` +
        `but this thesis expects ${thesis.targetAssetSymbol} ${thesis.direction.toUpperCase()} under the same event. ` +
        `These cannot coexist.`,
    );
  }

  const eventText = `${event.title} ${event.description ?? ""}`;
  const thesisText = `${thesis.title} ${thesis.statement}`;

  // Rule 2: de-escalation event vs war-benefit thesis
  const eventDeescalating = /\b(de-escalat|peace|thaw|ease|cool|settle|end)\b/i.test(eventText);
  const thesisWarBenefit = /\b(war drive|war fuel|conflict boost|tension lift|defense spend|defence spend|military spend)\b/i.test(
    thesisText,
  );
  if (eventDeescalating && thesisWarBenefit) {
    errors.push(
      `Logic mismatch: Event "${event.title}" describes de-escalation, but ` +
        `thesis "${thesis.title}" claims war/conflict benefits. ` +
        `Under de-escalation, war beneficiaries should weaken, not strengthen.`,
    );
  }

  // Rule 3: escalation event vs peace-benefit thesis
  const eventEscalating = /\b(escalat|intensif|surge|flare|heat|worsen)\b/i.test(eventText);
  const thesisPeaceBenefit = /\b(peace dividend|de-escalat|thaw benefit|resolution)\b/i.test(thesisText);
  if (eventEscalating && thesisPeaceBenefit) {
    errors.push(
      `Logic mismatch: Event "${event.title}" describes escalation, but ` +
        `thesis "${thesis.title}" claims peace/de-escalation benefits.`,
    );
  }

  // Rule 4: thesis should reference event keywords in reasoning
  const eventKeywords = event.title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4);
  const thesisLower = thesisText.toLowerCase();
  const sharedKeywords = eventKeywords.filter((kw) => thesisLower.includes(kw));
  if (eventKeywords.length > 0 && sharedKeywords.length === 0) {
    warnings.push(
      `Thesis "${thesis.title}" does not semantically reference event ` +
        `"${event.title}". Verify this thesis belongs under this event.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
