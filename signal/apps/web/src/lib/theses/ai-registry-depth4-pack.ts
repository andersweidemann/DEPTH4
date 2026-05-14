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
    "\\bover the next two quarters?\\b",
    "\\binto the summer\\b",
    "\\bsummer window\\b",
    "\\bthis quarter\\b",
    "\\bnext quarter\\b",
  ].join("|"),
  "i",
);

/** If "this year" appears, require an additional nearer-term hook (Part B). */
const NEARER_TIMING_HOOK = new RegExp(
  [
    "\\bwithin weeks\\b",
    "\\bwithin days\\b",
    "\\bwithin months\\b",
    "\\bthis earnings season\\b",
    "\\bnext (one|two|three|four|\\d+) prints?\\b",
    "\\bnext payroll\\b",
    "\\bnext FOMC\\b",
    "\\bbefore (the )?(next )?(earnings|FOMC|payroll|revenue)\\b",
    "\\blonger than (the )?(market|futures)\\b",
    "\\baward dates\\b",
    "\\bchokepoint\\b",
    "\\block in(?: its)? order book\\b",
    "\\bover the next (few |several )?(weeks|months)\\b",
    "\\bover the next two quarters?\\b",
    "\\binto the summer\\b",
    "\\bsummer window\\b",
    "\\bthis quarter\\b",
    "\\bnext quarter\\b",
    "\\bdelays?\\b",
    "\\bFed\\b",
  ].join("|"),
  "i",
);

/** Shallow sell-side / IR deck phrasing — not a DEPTH4 thesis hero. */
const ANALYST_DECK_HERO = /\b(Fair Value|Near Fair Value|Long-Term Targets|On Track|guidance reaffirmed|reaffirms guidance|PT raised|price target)\b/i;

/** Forward causal hero: forecast cue + causal linker (Part B §5). */
const CAUSAL_HERO_PATTERN =
  /\b(will|should|to\s+fade|stay|bid|rerat|rerates?|re-?rate|grinds?|underperform|outperform|lag|rip)\b[\s\S]{0,220}\b(as|because|when|while|before|if|on|into)\b/i;

/** Mispricing / gap language (legacy helper + tests). */
const MISPRICING_SIGNAL = new RegExp(
  [
    "\\b(market|futures|tape|investors?|crowd|prices?|pricing|priced|embedded|expects?|still|yet|misses?|",
    "under-?pric|over-?pric|mispric|wrong|early|late|anchored|discount|premium|versus|vs\\.|depth4|",
    "not\\s+repric|has\\s+not|ignores?|unpriced|overpriced)\\b",
  ].join(""),
  "i",
);

/** Requires an explicit “what is priced vs what we see” style line (Part B §2). */
const SPECIFIC_MISPRICING = new RegExp(
  [
    "the\\s+market\\s+is\\s+pricing",
    "market\\s+is\\s+pricing",
    "depth4\\s+sees",
    "consensus\\s+(still\\s+)?(embed|price|assumes)",
    "futures\\s+(still\\s+)?(embed|price)",
    "priced\\s+for\\s+.{6,}",
    "mispric",
    "wrong\\s+about\\s+.{4,}",
    "still\\s+anchors",
    "embeds?\\s+too\\s+much",
  ].join("|"),
  "i",
);

const L34_GENERIC_FILLER =
  /\b(trend continues|broadly supportive|supportive backdrop|macro backdrop|fundamentals remain solid|secular growth story|tailwind persists|generally positive backdrop)\b/i;

const MIN_L1_L2_CHARS = 28;
const MIN_L3_L4_CHARS = 48;

export function extractReasoningLevelBodies(chain: string): string[] | null {
  const t = chain.trim();
  const hits: { n: number; start: number; headLen: number }[] = [];
  let m: RegExpExecArray | null;
  const re = /LEVEL\s*(\d)\s*\([^)]*\)\s*:/gi;
  while ((m = re.exec(t)) !== null) {
    hits.push({ n: Number.parseInt(m[1] ?? "0", 10), start: m.index, headLen: m[0].length });
  }
  if (hits.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    if (hits[i].n !== i + 1) return null;
  }
  const bodies: string[] = [];
  for (let i = 0; i < 4; i++) {
    const start = hits[i].start + hits[i].headLen;
    const end = i + 1 < 4 ? hits[i + 1].start : t.length;
    bodies.push(t.slice(start, end).replace(/\s+/g, " ").trim());
  }
  return bodies;
}

function levelEchoesHero(hero: string, level: string): boolean {
  const h = hero.replace(/\s+/g, " ").trim().toLowerCase();
  const L = level.replace(/\s+/g, " ").trim().toLowerCase();
  if (L.length < 24 || h.length < 24) return false;
  if (L.includes(h.slice(0, Math.min(48, h.length)))) return true;
  if (h.includes(L.slice(0, Math.min(48, L.length)))) return true;
  return false;
}

function timingPassesPartB(hero: string): { ok: true } | { ok: false; reason: string } {
  if (!STRONG_TIMING_IN_HERO.test(hero)) {
    return { ok: false, reason: "reject_hero_timing_too_vague" };
  }
  if (/\bthis year\b/i.test(hero)) {
    const stripped = hero.replace(/\bthis year\b/gi, " ");
    if (!NEARER_TIMING_HOOK.test(stripped)) {
      return { ok: false, reason: "reject_hero_timing_this_year_without_nearer_hook" };
    }
  }
  return { ok: true };
}

function combinedMispricingProbe(r: MacroEventReasoning, hero: string): string {
  return [hero, r.mispricing_hypothesis ?? "", r.thesis_trade_line ?? "", r.reasoning_summary ?? ""].join(" \n ");
}

export function hasExplicitMispricingSignal(r: MacroEventReasoning, hero: string): boolean {
  const pack = combinedMispricingProbe(r, hero);
  if (pack.length < 36) return false;
  return MISPRICING_SIGNAL.test(pack);
}

/** @deprecated Use {@link reasoningChainLevelsPassInsertBar}; kept for unit tests. */
export function reasoningChainHasSubstantiveL3L4(reasoningChain: string): boolean {
  const bodies = extractReasoningLevelBodies(reasoningChain);
  if (!bodies) return false;
  return bodies[2].length >= MIN_L3_L4_CHARS && bodies[3].length >= MIN_L3_L4_CHARS;
}

function reasoningChainLevelsPassInsertBar(chain: string, hero: string): { ok: true } | { ok: false; reason: string } {
  const bodies = extractReasoningLevelBodies(chain);
  if (!bodies) {
    return { ok: false, reason: "reject_reasoning_levels_incomplete" };
  }
  for (let i = 0; i < 4; i++) {
    const min = i < 2 ? MIN_L1_L2_CHARS : MIN_L3_L4_CHARS;
    if (bodies[i].length < min) {
      return { ok: false, reason: "reject_reasoning_levels_too_thin" };
    }
    if (levelEchoesHero(hero, bodies[i])) {
      return { ok: false, reason: "reject_reasoning_level_echoes_hero" };
    }
  }
  if (L34_GENERIC_FILLER.test(bodies[2]) || L34_GENERIC_FILLER.test(bodies[3])) {
    return { ok: false, reason: "reject_reasoning_l34_generic_filler" };
  }
  const mispriceSlice = `${bodies[2]} ${bodies[3]} ${hero}`;
  if (!SPECIFIC_MISPRICING.test(mispriceSlice)) {
    return { ok: false, reason: "reject_mispricing_not_specific" };
  }
  return { ok: true };
}

/**
 * Part B — full validation before inserting **`public.theses`** (`ai_generated`).
 * On failure, callers should keep output in event_reasoning / feed only (no thesis row).
 */
export function passesAiThesisRegistryInsertValidation(p: {
  hero: string;
  reasoning: MacroEventReasoning;
}): { ok: true } | { ok: false; reason: string } {
  const hero = p.hero.trim();
  const chain = (p.reasoning.reasoning_chain ?? "").trim();

  if (!isAcceptableAiThesisRegistryHero(hero)) {
    return { ok: false, reason: "reject_registry_hero_base_bar" };
  }
  if (ANALYST_DECK_HERO.test(hero)) {
    return { ok: false, reason: "reject_analyst_style_hero" };
  }
  if (!CAUSAL_HERO_PATTERN.test(hero)) {
    return { ok: false, reason: "reject_hero_not_causal_forecast" };
  }

  const t = timingPassesPartB(hero);
  if (!t.ok) return t;

  if (!hasExplicitMispricingSignal(p.reasoning, hero)) {
    return { ok: false, reason: "reject_missing_explicit_mispricing_signal" };
  }

  const mh = (p.reasoning.mispricing_hypothesis ?? "").trim();
  if (!SPECIFIC_MISPRICING.test(`${chain} ${hero} ${mh}`)) {
    return { ok: false, reason: "reject_mispricing_not_specific" };
  }

  const levels = reasoningChainLevelsPassInsertBar(chain, hero);
  if (!levels.ok) return levels;

  return { ok: true };
}

/** @deprecated Alias for {@link passesAiThesisRegistryInsertValidation}. */
export const passesAiThesisRegistryDepth4Pack = passesAiThesisRegistryInsertValidation;
