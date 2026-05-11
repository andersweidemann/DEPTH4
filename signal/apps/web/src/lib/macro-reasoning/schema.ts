import { z } from "zod";

/**
 * Structured output for the macro reasoning layer (Levels 1–4).
 * Keywords/tag overlap are optional signals elsewhere; this object is the causal contract.
 *
 * Consumers: thesis–news matching, AI thesis generation, probability updates, Deep Brief / UX.
 */

/** Feed card scan limits (mobile); keep `prompts.ts` contract aligned. */
export const FEED_CARD_WORD_LIMITS = {
  event_summary: 15,
  reasoning_summary: 20,
  mispricing_hypothesis: 25,
} as const;

export function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export const thesisRelationSchema = z.enum(["confirm", "contradict", "create_new", "adjacent", "irrelevant"]);

const pctIntSchema = z.number().int().min(0).max(100);

/**
 * One catalog thesis: how this cluster reaches that line (second-order channel), not keyword overlap.
 * Emitted in prompt order for every seeded catalog thesis when the Known theses block is non-empty.
 */
export const catalogThesisPassSchema = z.object({
  thesis_id: z.string().min(1),
  relevance: z.enum(["none", "weak", "moderate", "strong"]),
  relation_to_thesis: z.enum(["confirms", "contradicts", "mixed", "unclear"]),
  /** Causal chain from cluster facts → intermediaries → this thesis (2–4 short sentences). */
  second_order_effect: z.string().min(1),
  /** Optional structural / year backdrop for this thesis line (1–2 sentences). */
  third_order_backdrop: z.string().optional().default(""),
});

const PLACEHOLDER_SECOND_ORDER = /^(n\/?a\.?|not applicable|no link|none)$/i;

/**
 * Stricter `per_catalog_thesis` rows for **new inserts** (event-reasoning cron).
 * Display / `safeParseMacroEventReasoning` stays on {@link catalogThesisPassSchema} so legacy rows still parse.
 */
export const catalogThesisPassSchemaForInsert = catalogThesisPassSchema.extend({
  second_order_effect: z
    .string()
    .min(60, { message: "second_order_effect must be at least 60 characters (substantive causal write-up)." })
    .refine((val) => !PLACEHOLDER_SECOND_ORDER.test(val.trim()), {
      message: "second_order_effect must be substantive, not a placeholder.",
    }),
});

export const macroEventReasoningSchema = z
  .object({
    /** Headline-level feed line — hard word cap. */
    event_summary: z.string().min(1),

    actors: z.array(z.string()).default([]),
    geography: z.array(z.string()).default([]),
    domain: z.string().min(1),

    /** e.g. tightening, easing, escalation, de-escalation, supply_shock, demand_shock */
    direction_of_change: z.string().min(1),

    confidence: z.number().min(0).max(1),

    first_order_effects: z.array(z.string().min(1)).min(1),
    second_order_effects: z.array(z.string().min(1)).min(1),
    third_order_effects: z.array(z.string().min(1)).min(1),

    impacted_assets: z.array(z.string()).default([]),
    impacted_sectors: z.array(z.string()).default([]),

    /** Thesis ids this reasoning links to (system, user, or future AI). */
    affected_theses: z.array(z.string()).default([]),

    thesis_relation: thesisRelationSchema,

    /**
     * DETAIL PAGE (not feed-capped):
     * Position, event, cause, **time window / catalyst**, probability; tickers; L1–L4 in reasoning_chain.
     * Example: "TLT will rally as the first Fed cut lands sooner than futures price because labor softens, probability 42%; catalyst: May payroll + FOMC."
     */
    thesis_trade_line: z.string().optional().default(""),

    /** DETAIL PAGE: prior thesis conviction % (broadly right ≈ Clean + Messy) for the thesis this event tests. */
    probability_before_pct: pctIntSchema.optional().nullable().default(null),
    /** DETAIL PAGE: updated thesis conviction % after this news (same semantics as before). */
    probability_after_pct: pctIntSchema.optional().nullable().default(null),
    probability_update: z.string().optional().default(""),

    /** DETAIL PAGE: one-line trade implication (bull/bear/neutral + action + assets). */
    trade_implication: z.string().optional().default(""),

    /** Full causal narrative (detail — not feed scan fields). */
    reasoning_chain: z.string().min(1),

    /** Feed: "why this matters" — word cap. */
    reasoning_summary: z.string().min(1),

    /** Feed: "market may be missing" — word cap. */
    mispricing_hypothesis: z.string().min(1),

    /**
     * Per seeded catalog thesis: explicit second-order (and optional third-order) read for this cluster.
     * When the prompt includes Known theses, the model must emit one entry per thesis id (exact id match).
     */
    per_catalog_thesis: z.array(catalogThesisPassSchema).default([]),
  })
  .superRefine((data, ctx) => {
    const es = countWords(data.event_summary);
    if (es > FEED_CARD_WORD_LIMITS.event_summary) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `event_summary: max ${FEED_CARD_WORD_LIMITS.event_summary} words for feed card (got ${es})`,
        path: ["event_summary"],
      });
    }
    const rs = countWords(data.reasoning_summary);
    if (rs > FEED_CARD_WORD_LIMITS.reasoning_summary) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `reasoning_summary: max ${FEED_CARD_WORD_LIMITS.reasoning_summary} words for feed card (got ${rs})`,
        path: ["reasoning_summary"],
      });
    }
    const mp = countWords(data.mispricing_hypothesis);
    if (mp > FEED_CARD_WORD_LIMITS.mispricing_hypothesis) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `mispricing_hypothesis: max ${FEED_CARD_WORD_LIMITS.mispricing_hypothesis} words for feed card (got ${mp})`,
        path: ["mispricing_hypothesis"],
      });
    }
  });

export type MacroEventReasoning = z.infer<typeof macroEventReasoningSchema>;
export type ThesisRelation = z.infer<typeof thesisRelationSchema>;
export type CatalogThesisPass = z.infer<typeof catalogThesisPassSchema>;
export type CatalogThesisPassForInsert = z.infer<typeof catalogThesisPassSchemaForInsert>;

/** Insert-time quality gate for `per_catalog_thesis` (min length + no placeholder-only strings). */
export function assertPerCatalogThesesInsertQuality(
  passes: CatalogThesisPass[],
): { ok: true } | { ok: false; message: string } {
  const r = z.array(catalogThesisPassSchemaForInsert).safeParse(passes);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { ok: false, message: msg };
  }
  return { ok: true };
}

/** After Zod parse: ensure one pass per catalog thesis id, no extras. */
export function catalogThesisPassesComplete(
  expectedIds: readonly string[],
  passes: CatalogThesisPass[],
): { ok: true } | { ok: false; message: string } {
  if (expectedIds.length === 0) return { ok: true };
  const want = new Set(expectedIds);
  if (passes.length !== want.size) {
    return {
      ok: false,
      message: `per_catalog_thesis: expected ${want.size} entries, got ${passes.length}`,
    };
  }
  const seen = new Set<string>();
  for (const p of passes) {
    if (!want.has(p.thesis_id)) {
      return { ok: false, message: `per_catalog_thesis: unknown thesis_id ${p.thesis_id}` };
    }
    if (seen.has(p.thesis_id)) {
      return { ok: false, message: `per_catalog_thesis: duplicate thesis_id ${p.thesis_id}` };
    }
    seen.add(p.thesis_id);
  }
  for (const id of Array.from(want)) {
    if (!seen.has(id)) return { ok: false, message: `per_catalog_thesis: missing thesis_id ${id}` };
  }
  return { ok: true };
}

export function parseMacroEventReasoning(raw: unknown): MacroEventReasoning {
  return macroEventReasoningSchema.parse(raw);
}

export function safeParseMacroEventReasoning(raw: unknown): {
  ok: true;
  data: MacroEventReasoning;
} | {
  ok: false;
  error: z.ZodError;
} {
  const r = macroEventReasoningSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: r.error };
}
