import type { Thesis } from "@/lib/thesis-engine-v2/types";

/**
 * Removes embedded numeric probability claims from thesis **prose** so the UI’s
 * Thesis conviction + scenario bars stay the single source of truth for %.
 *
 * Does not touch structured `probability` numbers on `Thesis` or scenario overrides.
 */

const TRAILING_PROB_PHRASE = /,?\s*probability\s+\d{1,3}\s*%\.?/gi;

const MID_PROB_PATTERNS: RegExp[] = [
  /\b(this\s+thesis\s+has\s+a\s+)\d{1,3}\s*%\s+chance\b/gi,
  /\b(odds|chance)\s+(are|is|of)\s+\d{1,3}\s*%/gi,
  /\b(a|the)\s+\d{1,3}\s*%\s+chance\b/gi,
  /\bprobability\s+is\s+\d{1,3}\s*%/gi,
  /\(\s*\d{1,3}\s*%\s*\)/g,
];

/** Regex-only cleanup + whitespace tidy (no forced punctuation). */
export function stripEmbeddedProbabilityPhrasesFromText(raw: string | undefined | null): string {
  if (raw == null) return "";
  if (!String(raw).trim()) return "";
  let s = String(raw);
  s = s.replace(TRAILING_PROB_PHRASE, "");
  for (const re of MID_PROB_PATTERNS) {
    s = s.replace(re, "");
  }
  s = s.replace(/\s{2,}/g, " ").trim();
  s = s.replace(/\s+,/g, ",").replace(/,\s*,/g, ",").replace(/,\s*$/g, "");
  return s.trim();
}

/** For hero / paragraph fields: end with sentence punctuation when missing. */
export function finalizeNarrativeSentence(s: string | undefined | null): string {
  if (s == null) return "";
  const t = String(s).trim();
  if (!t) return "";
  if (/[.!?…]$/.test(t)) return t;
  return `${t}.`;
}

/** Strip embedded % claims then normalize ending punctuation (for AI draft fields). */
export function repairLongFormNarrativeField(s: string | undefined | null): string {
  return finalizeNarrativeSentence(stripEmbeddedProbabilityPhrasesFromText(s));
}

/** Apply prose cleanup to all thesis narrative fields (incl. scenario path copy). */
export function applyThesisNarrativeProbabilityGuardToThesis(thesis: Thesis): Thesis {
  const strip = stripEmbeddedProbabilityPhrasesFromText;
  const longForm = repairLongFormNarrativeField;
  const optLong = (s: string | undefined) => {
    if (s === undefined) return undefined;
    if (!s.trim()) return s;
    return longForm(s);
  };
  let next: Thesis = {
    ...thesis,
    title: longForm(thesis.title ?? ""),
    thesisStatement: longForm(thesis.thesisStatement ?? ""),
    oneLineSummary: optLong(thesis.oneLineSummary),
    microLabel:
      thesis.microLabel != null && String(thesis.microLabel).trim()
        ? strip(String(thesis.microLabel))
        : thesis.microLabel,
    whyThesisExists: optLong(thesis.whyThesisExists),
    probabilityRationale: longForm(thesis.probabilityRationale ?? ""),
    whyNow: longForm(thesis.whyNow ?? ""),
    whatsUnpriced: longForm(thesis.whatsUnpriced ?? ""),
    hiddenDriver: longForm(thesis.hiddenDriver ?? ""),
    likelyPath: longForm(thesis.likelyPath ?? ""),
    marketMisread: longForm(thesis.marketMisread ?? ""),
    tradeExpression: longForm(thesis.tradeExpression ?? ""),
    trigger: longForm(thesis.trigger ?? ""),
    trade: longForm(thesis.trade ?? ""),
    invalidation: longForm(thesis.invalidation ?? ""),
    timeStop: optLong(thesis.timeStop),
    riskFactors: optLong(thesis.riskFactors),
  };

  if (thesis.thesisCascade) {
    const c = thesis.thesisCascade;
    next = {
      ...next,
      thesisCascade: {
        l1Confirmed: longForm(c.l1Confirmed ?? ""),
        l2ThisQuarter: longForm(c.l2ThisQuarter ?? ""),
        l3ThisYear: longForm(c.l3ThisYear ?? ""),
        l4Backdrop2026: longForm(c.l4Backdrop2026 ?? ""),
      },
    };
  }

  if (thesis.scenarioOverrides) {
    const o = thesis.scenarioOverrides;
    next = {
      ...next,
      scenarioOverrides: {
        base: {
          ...o.base,
          confirmation: longForm(o.base.confirmation ?? ""),
          marketConsequence: longForm(o.base.marketConsequence ?? ""),
        },
        bull: {
          ...o.bull,
          confirmation: longForm(o.bull.confirmation ?? ""),
          marketConsequence: longForm(o.bull.marketConsequence ?? ""),
        },
        bear: {
          ...o.bear,
          confirmation: longForm(o.bear.confirmation ?? ""),
          marketConsequence: longForm(o.bear.marketConsequence ?? ""),
        },
      },
    };
  }

  return next;
}

/** True if text still contains a suspicious `NN%` token after stripping (for tests / QA). */
export function narrativeTextStillHasStandalonePercentToken(s: string | undefined | null): boolean {
  if (s == null) return false;
  const t = String(s).trim();
  if (!t) return false;
  return /\b\d{1,3}\s*%/.test(t);
}

/**
 * Field names that still contain a raw `NN%` token after guard repair (should be empty for clean catalog).
 */
export function listThesisNarrativeProbabilityViolations(thesis: Thesis): string[] {
  const stripped = applyThesisNarrativeProbabilityGuardToThesis(thesis);
  const out: string[] = [];
  const check = (field: string, b: string | undefined) => {
    if (b && narrativeTextStillHasStandalonePercentToken(b)) out.push(field);
  };
  check("title", stripped.title);
  check("thesisStatement", stripped.thesisStatement);
  check("oneLineSummary", stripped.oneLineSummary);
  check("whyThesisExists", stripped.whyThesisExists);
  check("probabilityRationale", stripped.probabilityRationale);
  check("whyNow", stripped.whyNow);
  check("whatsUnpriced", stripped.whatsUnpriced);
  return out;
}
