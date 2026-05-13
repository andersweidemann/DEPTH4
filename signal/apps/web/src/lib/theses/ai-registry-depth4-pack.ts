import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";
import { isAcceptableAiThesisRegistryHero } from "@/lib/theses/thesis-surfacing-quality";

/** Hero must bind to a catalyst window sharper than generic “someday”. */
const STRONG_TIMING_IN_HERO = new RegExp(
  [
    "\\bwithin weeks\\b",
    "\\bwithin days\\b",
    "\\bnext week\\b",
    "\\bwithin months\\b",
    "\\bthis earnings season\\b",
    "\\bthis year\\b",
    "\\bnext (one|two|three|four|\\d+) prints?\\b",
    "\\bnext payroll\\b",
    "\\bnext FOMC\\b",
    "\\bbefore (the )?(next )?(earnings|FOMC|payroll|revenue)\\b",
    "\\blonger than (the )?(market|futures)\\b",
    "\\baward dates\\b",
    "\\bchokepoint\\b",
    "\\block in(?: its)? order book\\b",
    "\\bover the next (few |several )?(weeks|months)\\b",
    "\\binto the summer\\b",
    "\\bsummer window\\b",
    "\\bthis quarter\\b",
    "\\bnext quarter\\b",
  ].join("|"),
  "i",
);

/** Shallow sell-side / IR deck phrasing — not a DEPTH4 thesis hero. */
const ANALYST_DECK_HERO = /\b(Fair Value|Near Fair Value|Long-Term Targets|On Track|guidance reaffirmed|reaffirms guidance|PT raised|price target)\b/i;

/**
 * Mispricing / gap language (hero + feed hypothesis + summaries). Require at least one hit in the combined pack string.
 */
const MISPRICING_SIGNAL = new RegExp(
  [
    "\\b(market|futures|tape|investors?|crowd|prices?|priced|embedded|expects?|still|yet|misses?|",
    "under-?pric|over-?pric|mispric|wrong|early|late|anchored|discount|premium|versus|vs\\.|",
    "not\\s+repric|has\\s+not|ignores?|unpriced|overpriced)\\b",
  ].join(""),
  "i",
);

const LEVEL_3_HEADER = /LEVEL\s*3\s*\(THIS QUARTER[^)]*\):/i;
const LEVEL_4_HEADER = /LEVEL\s*4\s*\(STRUCTURAL BIAS[^)]*\):/i;

const MIN_L3_L4_CHARS = 48;

export function reasoningChainHasSubstantiveL3L4(reasoningChain: string): boolean {
  const c = reasoningChain.trim();
  const l3h = c.match(LEVEL_3_HEADER);
  const l4h = c.match(LEVEL_4_HEADER);
  if (!l3h || l3h.index === undefined || !l4h || l4h.index === undefined) return false;
  if (l4h.index <= l3h.index) return false;
  const l3Body = c.slice(l3h.index + l3h[0].length, l4h.index).replace(/\s+/g, " ").trim();
  const l4Body = c.slice(l4h.index + l4h[0].length).replace(/\s+/g, " ").trim();
  return l3Body.length >= MIN_L3_L4_CHARS && l4Body.length >= MIN_L3_L4_CHARS;
}

function combinedMispricingProbe(r: MacroEventReasoning, hero: string): string {
  return [hero, r.mispricing_hypothesis ?? "", r.thesis_trade_line ?? "", r.reasoning_summary ?? ""].join(" \n ");
}

export function hasExplicitMispricingSignal(r: MacroEventReasoning, hero: string): boolean {
  const pack = combinedMispricingProbe(r, hero);
  if (pack.length < 36) return false;
  return MISPRICING_SIGNAL.test(pack);
}

/**
 * Full DEPTH4 pack for minting **`public.theses`** (`ai_generated`): timing, mispricing, L3–L4 depth (no ticker allowlist).
 * Event feed may stay shallow; registry rows must clear this gate.
 */
export function passesAiThesisRegistryDepth4Pack(p: {
  hero: string;
  reasoning: MacroEventReasoning;
}): { ok: true } | { ok: false; reason: string } {
  const hero = p.hero.trim();
  if (!isAcceptableAiThesisRegistryHero(hero)) {
    return { ok: false, reason: "reject_registry_hero_base_bar" };
  }
  if (ANALYST_DECK_HERO.test(hero)) {
    return { ok: false, reason: "reject_analyst_style_hero" };
  }
  if (!STRONG_TIMING_IN_HERO.test(hero)) {
    return { ok: false, reason: "reject_hero_timing_too_vague" };
  }
  if (!hasExplicitMispricingSignal(p.reasoning, hero)) {
    return { ok: false, reason: "reject_missing_explicit_mispricing_signal" };
  }
  if (!reasoningChainHasSubstantiveL3L4(p.reasoning.reasoning_chain ?? "")) {
    return { ok: false, reason: "reject_reasoning_chain_l3_l4_too_thin" };
  }
  return { ok: true };
}
