import { z } from "zod";

/**
 * Structured output for the macro reasoning layer (Levels 1–4).
 * Keywords/tag overlap are optional signals elsewhere; this object is the causal contract.
 *
 * Consumers: thesis–news matching, AI thesis generation, probability updates, Deep Brief / UX.
 */

export const thesisRelationSchema = z.enum(["confirm", "contradict", "create_new", "adjacent", "irrelevant"]);

export const macroEventReasoningSchema = z.object({
  event_summary: z.string().min(1),

  actors: z.array(z.string()).default([]),
  geography: z.array(z.string()).default([]),
  domain: z.string().min(1),

  /** e.g. tightening, easing, escalation, de-escalation, supply_shock, demand_shock */
  direction_of_change: z.string().min(1),

  confidence: z.number().min(0).max(1),

  first_order_effects: z.array(z.string()).default([]),
  second_order_effects: z.array(z.string()).default([]),
  third_order_effects: z.array(z.string()).default([]),

  impacted_assets: z.array(z.string()).default([]),
  impacted_sectors: z.array(z.string()).default([]),

  /** Thesis ids this reasoning links to (system, user, or future AI). */
  affected_theses: z.array(z.string()).default([]),

  thesis_relation: thesisRelationSchema,

  /** Level-by-level narrative for audit / Deep Brief (can be multi-sentence). */
  reasoning_chain: z.string().min(1),

  /** One tight paragraph for UI / alerts. */
  reasoning_summary: z.string().min(1),

  /** Level 4: what may still be mispriced or under-discounted. */
  mispricing_hypothesis: z.string().min(1),
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
