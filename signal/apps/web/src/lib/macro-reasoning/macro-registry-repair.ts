import { parseJsonObject } from "@signal/ai";
import { z } from "zod";
import { anthropicMessages } from "@/lib/macro-reasoning/anthropic-messages";
import { FEED_CARD_WORD_LIMITS, countWords } from "@/lib/macro-reasoning/schema";
import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";
import { safeParseMacroEventReasoning } from "@/lib/macro-reasoning/schema";

/** Bump when repair instructions change (logged; not a DB prompt_version key). */
export const MACRO_REGISTRY_REPAIR_PROMPT_VERSION = "macro-registry-repair-v1";

const VISION_EXCERPT = `DEPTH4 (product): cause, path, timing, and market implication are mandatory. Generic summaries or headline rewrites are failure. Four levels: L1 confirmed (Tier 1–2), L2 this week (1–7d), L3 this month (7–30d) with explicit mispricing, L4 this quarter (30–90d+). Mispricing must state what the crowd prices vs what you see. Voice: simple retail trading English — concrete, not analyst deck tone.`;

const registryRepairOutputSchema = z.object({
  thesis_trade_line: z.string(),
  reasoning_chain: z.string().min(120),
  mispricing_hypothesis: z
    .string()
    .min(1)
    .refine((s) => countWords(s) <= FEED_CARD_WORD_LIMITS.mispricing_hypothesis, "mispricing_hypothesis word cap"),
  reasoning_summary: z
    .string()
    .min(1)
    .refine((s) => countWords(s) <= FEED_CARD_WORD_LIMITS.reasoning_summary, "reasoning_summary word cap"),
  trade_implication: z.string().min(1),
  event_summary: z
    .string()
    .min(1)
    .optional()
    .refine((s) => s == null || countWords(s) <= FEED_CARD_WORD_LIMITS.event_summary, "event_summary word cap"),
});

export type MacroRegistryRepairPatch = z.infer<typeof registryRepairOutputSchema>;

const REPAIR_SYSTEM = `You are DEPTH4's registry repair pass. The first model draft failed the thesis registry hero gate.

${VISION_EXCERPT}

TASK
- Read the rejection reason and the draft JSON fields provided in the user message.
- Output ONE JSON object only (no markdown). Keys exactly:
  thesis_trade_line, reasoning_chain, mispricing_hypothesis, reasoning_summary, trade_implication
  Optional key: event_summary (only if the current event_summary is a raw headline echo — rewrite it as a 1-sentence scan line, max 15 words).

RULES
1) thesis_trade_line is the REGISTRY HERO — a NEW causal trade sentence. It must NOT be a literal or near-literal copy of the anchor headline, cluster title hint, or transcript title. It MUST contain a forward market verb (will / should / likely to / rerate / fade / outperform / underperform / stay bid / misprice / if / when / before / within weeks / this quarter / next print / this earnings season) plus cause and timing.
2) reasoning_chain must use EXACTLY four headers in order, each on its own line, matching the main macro prompt:
   LEVEL 1 (CONFIRMED TODAY — 0–24h):
   LEVEL 2 (THIS WEEK — 1–7d):
   LEVEL 3 (THIS MONTH — 7–30d):
   LEVEL 4 (THIS QUARTER — 30–90d+):
   LEVEL 3 MUST include one sentence matching: "The market is pricing [X], but DEPTH4 sees [Y]."
3) mispricing_hypothesis: one or two sharp sentences; name tickers or prints when possible.
4) reasoning_summary: timing/positioning edge, max ~20 words.
5) trade_implication: start with exactly one of Bullish / Bearish / Neutral, then tickers and bias (no imperative Buy/Sell).
6) For transcript or earnings-call clusters: write the hero about the **market repricing** (guidance, margins, rerating, credit, flows) implied by the cluster — never paste "Q1 20xx Earnings Call Transcript" style strings into thesis_trade_line.
7) For geopolitical photo-op headlines: bind to how futures, FX, or sector ETFs misprice the **path** (deal optics vs substance) with a weeks-scale catalyst.

BAD thesis_trade_line examples (never output anything like these):
- "Maravai LifeSciences Holdings, Inc. (MRVI) Q1 2026 Earnings Call Transcript"
- "Trump in China for talks with Xi Jinping"

GOOD thesis_trade_line shape (meaning, do not copy verbatim):
- "MRVI may rerate higher within two prints if management proves the growth story is durable beyond the COVID bump, because the tape still prices a one-quarter fade."
- "US–China headline risk will fade faster than FXI prices unless Xi signals tariff relief before the next review window within weeks."`;

export function mergeMacroReasoningRegistryPatch(base: MacroEventReasoning, patch: MacroRegistryRepairPatch): MacroEventReasoning {
  return {
    ...base,
    thesis_trade_line: patch.thesis_trade_line,
    reasoning_chain: patch.reasoning_chain,
    mispricing_hypothesis: patch.mispricing_hypothesis,
    reasoning_summary: patch.reasoning_summary,
    trade_implication: patch.trade_implication,
    ...(patch.event_summary != null && patch.event_summary.trim() ? { event_summary: patch.event_summary.trim() } : {}),
  };
}

export function registryRepairEnabled(): boolean {
  return (process.env.EVENT_REASONING_REGISTRY_REPAIR ?? "1").trim() !== "0";
}

export function shouldAttemptRegistryRepair(ensureReason: string): boolean {
  return (
    ensureReason === "reject_non_causal_hero_for_registry" ||
    ensureReason === "reject_registry_hero_base_bar" ||
    ensureReason === "reject_analyst_style_hero"
  );
}

/**
 * One-shot repair: returns merged reasoning, or null if repair LLM / parse fails.
 */
export async function attemptMacroReasoningRegistryRepair(args: {
  apiKey: string;
  model: string;
  maxTokens: number;
  anchorHeadline: string;
  titleHint: string | null;
  reasoning: MacroEventReasoning;
  ensureReason: string;
}): Promise<{ merged: MacroEventReasoning; raw: unknown; assistantText: string } | null> {
  const draft = {
    thesis_trade_line: args.reasoning.thesis_trade_line ?? "",
    event_summary: args.reasoning.event_summary ?? "",
    reasoning_summary: args.reasoning.reasoning_summary ?? "",
    mispricing_hypothesis: args.reasoning.mispricing_hypothesis ?? "",
    trade_implication: args.reasoning.trade_implication ?? "",
    reasoning_chain: args.reasoning.reasoning_chain ?? "",
  };

  const user = `REJECTION_REASON: ${args.ensureReason}
ANCHOR_HEADLINE: ${args.anchorHeadline}
TITLE_HINT: ${args.titleHint ?? "(none)"}

DRAFT_FIELDS_JSON:
${JSON.stringify(draft, null, 2)}

Return the repair JSON object with keys thesis_trade_line, reasoning_chain, mispricing_hypothesis, reasoning_summary, trade_implication, and optionally event_summary.`;

  let text: string;
  let raw: unknown;
  try {
    const out = await anthropicMessages({
      apiKey: args.apiKey,
      model: args.model,
      maxTokens: args.maxTokens,
      system: REPAIR_SYSTEM,
      user,
    });
    text = out.text;
    raw = out.raw;
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseJsonObject<unknown>(text);
  } catch {
    return null;
  }

  const patchParsed = registryRepairOutputSchema.safeParse(parsed);
  if (!patchParsed.success) return null;

  const merged = mergeMacroReasoningRegistryPatch(args.reasoning, patchParsed.data);
  const validated = safeParseMacroEventReasoning(merged);
  if (!validated.ok) return null;

  return { merged: validated.data, raw, assistantText: text };
}
