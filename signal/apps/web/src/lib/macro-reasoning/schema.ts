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

    /** Full causal narrative (detail — not feed scan fields). */
    reasoning_chain: z.string().min(1),

    /** Feed: "why this matters" — word cap. */
    reasoning_summary: z.string().min(1),

    /** Feed: "market may be missing" — word cap. */
    mispricing_hypothesis: z.string().min(1),
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
