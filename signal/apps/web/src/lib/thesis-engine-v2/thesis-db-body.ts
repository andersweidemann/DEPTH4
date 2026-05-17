import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { applyThesisNarrativeProbabilityGuardToThesis } from "@/lib/thesis-engine-v2/thesis-narrative-probability-guard";
import { parseThesisDepthBookFromUnknown } from "@/lib/thesis-engine-v2/thesis-depth-canonical";
import {
  anatomyToDbJson,
  applyAnatomySemantics,
  parseThesisStructuredAnatomy,
} from "@/lib/thesis-engine-v2/thesis-structured-anatomy";

/**
 * Supabase `public.theses.body` — optional JSON narrative for thesis book copy.
 *
 * **Single purpose per field** (global contract — same as `Thesis` in `types.ts`):
 * - Prefer top-level columns for `title` / `micro_label`; body may mirror them for AI round-trips.
 * - `thesis_statement` / `title`: the hero trade sentence appears **once** here (not again in why / cascade).
 * - `whats_unpriced`: what the market hasn’t priced yet / the edge — **once**, plain words; leave `market_misread` empty or omit.
 * - `trigger`, `trade`, `invalidation`, `time_stop`: each appears **once** in its own block.
 * - `why_thesis_exists`: 3–4 short paragraphs, framing only (see baseline catalog in `catalog-data.ts`), no paste of hero / trigger / trade.
 * - `risk_factors`: summarizes risks and **references** invalidation (“see Invalidation”), never duplicates full stand-down text.
 *
 * Use **snake_case** keys in stored JSON; this module maps to `Thesis` camelCase.
 */
export type ThesisBodyJson = {
  micro_label?: string | null;
  one_line_summary?: string | null;
  thesis_statement?: string | null;
  why_thesis_exists?: string | null;
  thesis_cascade?: {
    l1_confirmed?: string | null;
    l2_this_quarter?: string | null;
    l3_this_year?: string | null;
    l4_backdrop_2026?: string | null;
  } | null;
  hidden_driver?: string | null;
  likely_path?: string | null;
  market_misread?: string | null;
  trade_expression?: string | null;
  why_now?: string | null;
  whats_unpriced?: string | null;
  trigger?: string | null;
  trade?: string | null;
  invalidation?: string | null;
  time_stop?: string | null;
  horizon?: string | null;
  probability_rationale?: string | null;
  risk_factors?: string | null;
  entry_zone?: string | null;
  stop?: string | null;
  target1?: string | null;
  target2?: string | null;
  /** Canonical four-depth book — see `thesis-depth-canonical.ts`. */
  thesis_depth_book?: unknown;
  /** Phase 3B structured anatomy — see `thesis-structured-anatomy.ts`. */
  thesis_structured_anatomy?: unknown;
};

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

/** Merge `public.theses.body` into a client `Thesis` (catalog baseline or user-authored baseline). */
export function mergeDbBodyIntoThesis(thesis: Thesis, body: unknown): Thesis {
  if (!body || typeof body !== "object" || Array.isArray(body)) return normalizeThesisNarrativeFields(thesis);
  const o = body as Record<string, unknown>;
  const tcRaw = o.thesis_cascade;
  let thesisCascade: Thesis["thesisCascade"] | undefined = thesis.thesisCascade;
  if (tcRaw && typeof tcRaw === "object" && !Array.isArray(tcRaw)) {
    const c = tcRaw as Record<string, unknown>;
    const base = thesis.thesisCascade;
    thesisCascade = {
      l1Confirmed: str(c.l1_confirmed ?? c.l1Confirmed) ?? base?.l1Confirmed ?? "",
      l2ThisQuarter: str(c.l2_this_quarter ?? c.l2ThisQuarter) ?? base?.l2ThisQuarter ?? "",
      l3ThisYear: str(c.l3_this_year ?? c.l3ThisYear) ?? base?.l3ThisYear ?? "",
      l4Backdrop2026: str(c.l4_backdrop_2026 ?? c.l4Backdrop2026) ?? base?.l4Backdrop2026 ?? "",
    };
  }

  const depthBook = parseThesisDepthBookFromUnknown(o.thesis_depth_book);
  const parsedAnatomy = parseThesisStructuredAnatomy(o.thesis_structured_anatomy);
  const structuredAnatomy = parsedAnatomy
    ? applyAnatomySemantics(parsedAnatomy, {
        asset: thesis.asset,
        direction: thesis.direction,
        thesis_statement: thesis.thesisStatement,
        why_now: thesis.whyNow,
        whats_unpriced: thesis.whatsUnpriced,
        trigger_entry_setup: thesis.trigger,
        target: thesis.target1,
        horizon: thesis.horizon,
        trade: thesis.trade,
        hidden_driver: thesis.hiddenDriver,
        likely_path: thesis.likelyPath,
        trade_expression: thesis.tradeExpression,
        bullInstruments: thesis.insiderFlow?.bullInstruments,
        bearInstruments: thesis.insiderFlow?.bearInstruments,
      })
    : null;

  const next: Thesis = {
    ...thesis,
    ...(depthBook ? { thesisDepthBook: depthBook } : {}),
    ...(structuredAnatomy ? { structuredAnatomy } : {}),
    ...(str(o.one_line_summary) !== undefined ? { oneLineSummary: str(o.one_line_summary) } : {}),
    ...(str(o.thesis_statement) !== undefined ? { thesisStatement: str(o.thesis_statement)! } : {}),
    ...(str(o.why_thesis_exists) !== undefined ? { whyThesisExists: str(o.why_thesis_exists) } : {}),
    ...(thesisCascade !== undefined ? { thesisCascade } : {}),
    ...(str(o.hidden_driver) !== undefined ? { hiddenDriver: str(o.hidden_driver)! } : {}),
    ...(str(o.likely_path) !== undefined ? { likelyPath: str(o.likely_path)! } : {}),
    ...(str(o.market_misread) !== undefined ? { marketMisread: str(o.market_misread) ?? "" } : {}),
    ...(str(o.trade_expression) !== undefined ? { tradeExpression: str(o.trade_expression)! } : {}),
    ...(str(o.why_now) !== undefined ? { whyNow: str(o.why_now)! } : {}),
    ...(str(o.whats_unpriced) !== undefined ? { whatsUnpriced: str(o.whats_unpriced)! } : {}),
    ...(str(o.trigger) !== undefined ? { trigger: str(o.trigger)! } : {}),
    ...(str(o.trade) !== undefined ? { trade: str(o.trade)! } : {}),
    ...(str(o.invalidation) !== undefined ? { invalidation: str(o.invalidation)! } : {}),
    ...(str(o.time_stop) !== undefined ? { timeStop: str(o.time_stop) } : {}),
    ...(str(o.horizon) !== undefined ? { horizon: str(o.horizon)! } : {}),
    ...(str(o.probability_rationale) !== undefined ? { probabilityRationale: str(o.probability_rationale)! } : {}),
    ...(str(o.risk_factors) !== undefined ? { riskFactors: str(o.risk_factors) } : {}),
    ...(str(o.entry_zone) !== undefined ? { entryZone: str(o.entry_zone) } : {}),
    ...(str(o.stop) !== undefined ? { stop: str(o.stop) } : {}),
    ...(str(o.target1) !== undefined ? { target1: str(o.target1) } : {}),
    ...(str(o.target2) !== undefined ? { target2: str(o.target2) } : {}),
  };

  return normalizeThesisNarrativeFields(next);
}

/**
 * Defensive cleanup for legacy / LLM drift: fold obvious duplicate misread into unpriced,
 * trim risk_factors when it blindly repeats invalidation.
 */
export function normalizeThesisNarrativeFields(thesis: Thesis): Thesis {
  thesis = applyThesisNarrativeProbabilityGuardToThesis(thesis);
  const whatsUnpriced = (thesis.whatsUnpriced ?? "").trim();
  let marketMisread = (thesis.marketMisread ?? "").trim();
  const invalidation = (thesis.invalidation ?? "").trim();

  if (marketMisread && whatsUnpriced && whatsUnpriced.includes(marketMisread)) {
    marketMisread = "";
  }
  if (marketMisread && invalidation && marketMisread.length > 20 && invalidation.includes(marketMisread.slice(0, 40))) {
    marketMisread = "";
  }

  let riskOut: string | undefined = thesis.riskFactors?.trim();
  if (riskOut && invalidation.length > 24) {
    const invPrefix = invalidation.slice(0, Math.min(80, invalidation.length));
    if (riskOut.includes(invPrefix)) {
      riskOut =
        "Main risk is that invalidation conditions trigger — see Invalidation — plus headline and liquidity shocks outside the written thesis path.";
    }
  }

  return {
    ...thesis,
    whatsUnpriced: whatsUnpriced || thesis.whatsUnpriced,
    marketMisread,
    ...(riskOut !== undefined && riskOut !== thesis.riskFactors?.trim() ? { riskFactors: riskOut } : {}),
  };
}

/** Serialize narrative fields for `public.theses.body` on user sync (subset of `Thesis`). */
export function thesisToDbBodyPayload(thesis: Thesis): Record<string, unknown> {
  const cascade = thesis.thesisCascade;
  return {
    one_line_summary: thesis.oneLineSummary ?? null,
    thesis_statement: thesis.thesisStatement,
    why_thesis_exists: thesis.whyThesisExists ?? null,
    thesis_cascade: cascade
      ? {
          l1_confirmed: cascade.l1Confirmed,
          l2_this_quarter: cascade.l2ThisQuarter,
          l3_this_year: cascade.l3ThisYear,
          l4_backdrop_2026: cascade.l4Backdrop2026,
        }
      : null,
    hidden_driver: thesis.hiddenDriver,
    likely_path: thesis.likelyPath,
    market_misread: thesis.marketMisread || null,
    trade_expression: thesis.tradeExpression,
    why_now: thesis.whyNow,
    whats_unpriced: thesis.whatsUnpriced,
    trigger: thesis.trigger,
    trade: thesis.trade,
    invalidation: thesis.invalidation,
    time_stop: thesis.timeStop ?? null,
    horizon: thesis.horizon,
    probability_rationale: thesis.probabilityRationale,
    risk_factors: thesis.riskFactors ?? null,
    entry_zone: thesis.entryZone ?? null,
    stop: thesis.stop ?? null,
    target1: thesis.target1 ?? null,
    target2: thesis.target2 ?? null,
    thesis_depth_book: thesis.thesisDepthBook ?? null,
    thesis_structured_anatomy: thesis.structuredAnatomy ? anatomyToDbJson(thesis.structuredAnatomy) : null,
  };
}
