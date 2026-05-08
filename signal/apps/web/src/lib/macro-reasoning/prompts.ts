/**
 * Step 2 — LLM prompts for macro / cluster reasoning (L1→L4).
 * Orchestration, cron, and thesis-news wiring live elsewhere.
 */

import { FEED_CARD_WORD_LIMITS } from "./schema";

/** Keep in sync with `event_reasoning.prompt_version` for idempotent upserts. */
export const MACRO_EVENT_REASONING_PROMPT_VERSION = "macro-reasoning-feed-card-v1";

/**
 * Exact JSON object the model must emit (single JSON object, no markdown fences).
 * Matches `macroEventReasoningSchema` in `./schema.ts`.
 */
export const MACRO_EVENT_REASONING_JSON_CONTRACT = `Output one JSON object only. No markdown. No code fences. Use these keys:

- event_summary: string. FEED CARD — scan on a phone before "View reasoning." Max ${FEED_CARD_WORD_LIMITS.event_summary} words. One sentence only. Headline-level: what is this about? Start with the key fact. No filler.
- actors: string[] (can be empty). Who is involved? Country, company, or person names. Keep it simple.
- geography: string[] (can be empty). Where? Use names people know.
- domain: string. One word or short phrase for the topic. Example: energy, rates, war, trade, banks, jobs, oil.
- direction_of_change: string. Are things getting better or worse for risk? Tighter or looser? Up or down? Say it simply.
- confidence: number from 0 to 1. How sure are you, based only on the text? Not a string.

- first_order_effects: string[] (must have at least one item). What is the first real-world change? One short sentence per item.
- second_order_effects: string[] (must have at least one item). What happens next because of that? One short sentence per item.
- third_order_effects: string[] (must have at least one item). What happens after that? One short sentence per item. Do not just repeat headline words.

- impacted_assets: string[] (can be empty). What to watch? Tickers or simple names. Example: oil, gold, 10-year yield.
- impacted_sectors: string[] (can be empty). Which parts of the market? Example: energy, tech, banks.

- affected_theses: string[] (can be empty). Use only thesis ids from the Known theses list in the user message. If none fit, use [].
- thesis_relation: must be exactly one of: "confirm" | "contradict" | "create_new" | "adjacent" | "irrelevant".
  - confirm: backs a thesis on the list.
  - contradict: works against a thesis on the list.
  - create_new: sounds like a new thesis (list does not cover it).
  - adjacent: connected but not a clean yes/no.
  - irrelevant: not worth trading the news.

- reasoning_chain: string. DETAIL PAGE — not shown on the feed card. Tell the full story in order. Short sentences. Say what matters first. No bullet symbols inside this string.

- reasoning_summary: string. FEED CARD — quick "why this matters." Max ${FEED_CARD_WORD_LIMITS.reasoning_summary} words. One or two sentences. Urgent but calm. No setup — jump to the point.

- mispricing_hypothesis: string. FEED CARD — "the market may be missing…" Max ${FEED_CARD_WORD_LIMITS.mispricing_hypothesis} words. One or two sentences. Plain words. Say the mistake clearly.`;

export const MACRO_EVENT_REASONING_SYSTEM = `You are DEPTH4. You help traders think ahead. You write for smart people who are not macro experts.

RULE ONE
If a retail trader would stop and read a line twice, make it simpler.

HOW TO WRITE
- Use short sentences. Use everyday words.
- Sound calm and clear. Do not sound like a professor or a hedge fund memo.
- Say why things matter. Say what could move. Say what people might be wrong about.

PHRASES THAT WORK
Use plain setups like: "This matters because…" "The market may be missing…" "If this continues…" "That would hurt…" "That would help…" "Watch for…" "The big question is…"

WORDS TO SKIP
Do not use insider phrases like: cross-sectional, bifurcates, calibration event, regime shift, idiosyncratic, information value, convexity, reflexive, transmission mechanism, dislocation, mosaic, non-linear, second derivative, latent stress, path dependency, incremental evidence, deteriorating breadth, pocket of weakness, broad-based deterioration.
Say the same idea in simple words. Example: instead of "regime shift," say "conditions across the market are changing."

IF YOU NEED A TECH TERM
Explain it in the same sentence with simple words.

GOOD EXAMPLE
"Several small lenders reported on the same day. Together that is a clean check on whether loan trouble is spreading. If more banks show weak loans, junk bonds could sell off and long-term government bonds could catch a bid."

BAD EXAMPLE
"A same-day cluster of cross-sectional BDC disclosures creates incremental information value around the transmission of higher-for-longer policy into middle-market credit conditions."

FEED CARD FIELDS (must pass the "walking + phone" test)
Three strings show on the feed before anyone clicks. They must be extremely short and scannable.
- event_summary: headline — max ${FEED_CARD_WORD_LIMITS.event_summary} words, 1 sentence.
- reasoning_summary: why it matters — max ${FEED_CARD_WORD_LIMITS.reasoning_summary} words, 1–2 sentences.
- mispricing_hypothesis: what the market may be missing — max ${FEED_CARD_WORD_LIMITS.mispricing_hypothesis} words, 1–2 sentences.
Tone: urgent but calm, useful, not dramatic. No throat-clearing. If it feels long while walking, cut it.

GOOD FEED CARD (copy this density)
event_summary: "Multiple small lenders reported earnings at the same time."
reasoning_summary: "Together, they show whether credit stress is spreading beyond big banks."
mispricing_hypothesis: "The market may not see that credit quality is slipping across several lenders at once."

BAD FEED CARD (never do this — too long and jargony)
event_summary: "A simultaneous release of Q1 2026 earnings materials across REITs, specialty credit, a utility, consumer names, and small-cap M&A/Sigonomics issuers refreshes the fundamental tape on commercial real estate health, rate sensitivity, consumer demand, and AI monetization breadth."
reasoning_summary: "The cross-sectional information value of simultaneous small/mid-cap earnings disclosures may be under-weighted by the market as a leading indicator of regime shifts in private credit stress and downstream industrial demand softness."
mispricing_hypothesis: "Markets broadly assume manageable non-accruals in floating-rate private credit vehicles, but synchronized Q1 prints could reveal coordinated PIK growth and NAV erosion that has been masked by mark-to-model accounting practices across the BDC cohort."

FINAL FEED RULE
In 5 seconds the reader should answer: "Should I click to read more?" If they cannot tell what the event is, you failed.

YOUR FOUR STEPS (put them in the JSON and in reasoning_chain)
1) What happened?
2) What changes first in the real world?
3) What happens next? Then what?
4) What might prices get wrong? Which theses fit?

MORE RULES
- Explain causes. Do not say the story "matches" keywords.
- Each effect line is one new idea. No empty repeats.
- confidence is how strong the case is from the text alone. Loud headlines do not raise confidence by themselves.
- Return JSON only. Nothing before or after the JSON.

JSON CONTRACT

${MACRO_EVENT_REASONING_JSON_CONTRACT}`;

export type MacroReasoningThesisStub = {
  id: string;
  title: string;
};

export type MacroReasoningMemberEvent = {
  id: string;
  headline: string;
  body_excerpt?: string | null;
  signal_level?: number | null;
  published_at?: string | null;
  created_at?: string | null;
  category?: string | null;
  region?: string | null;
  affected_tickers?: unknown;
  affected_sectors?: unknown;
};

export type MacroReasoningClusterContext = {
  cluster_id: string;
  cluster_status?: string | null;
  title_hint?: string | null;
  signal_score?: number | null;
  anchor_event_id: string;
  member_events: MacroReasoningMemberEvent[];
  /** Optional catalog; affected_theses must only use ids from this list. */
  known_theses?: MacroReasoningThesisStub[];
};

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * User message: evidence bundle + instructions to emit MacroEventReasoning JSON.
 */
export function buildMacroReasoningUserPrompt(ctx: MacroReasoningClusterContext): string {
  const thesisBlock =
    ctx.known_theses && ctx.known_theses.length
      ? stringifyJson(ctx.known_theses.map((t) => ({ id: t.id, title: t.title })))
      : "[] (no thesis list — use affected_theses: []; use thesis_relation create_new or adjacent if the story still matters)";

  const members = ctx.member_events.map((e) => ({
    id: e.id,
    headline: e.headline,
    body_excerpt: (e.body_excerpt ?? "").slice(0, 1_500),
    signal_level: e.signal_level ?? null,
    published_at: e.published_at ?? null,
    created_at: e.created_at ?? null,
    category: e.category ?? null,
    region: e.region ?? null,
    affected_tickers: e.affected_tickers ?? [],
    affected_sectors: e.affected_sectors ?? [],
  }));

  return `One news cluster. One shared story. One anchor row id (for the database).

CLUSTER ID: ${ctx.cluster_id}
STATUS: ${ctx.cluster_status ?? "unknown"}
TITLE HINT: ${ctx.title_hint ?? "(none)"}
SIGNAL SCORE: ${ctx.signal_score ?? "(none)"}
ANCHOR EVENT ID (stored row): ${ctx.anchor_event_id}

The anchor is the lead headline. Still read every member story below. Build one timeline.

NEWS IN THIS CLUSTER
${stringifyJson(members)}

KNOWN THESES (copy ids exactly for affected_theses; use [] if none fit)
${thesisBlock}

WHAT TO DO
1) Merge the headlines into one clear story.
2) Fill every field. Pass the retail read test on every string.
3) Feed card caps are strict: event_summary ≤ ${FEED_CARD_WORD_LIMITS.event_summary} words (1 sentence); reasoning_summary ≤ ${FEED_CARD_WORD_LIMITS.reasoning_summary} words; mispricing_hypothesis ≤ ${FEED_CARD_WORD_LIMITS.mispricing_hypothesis} words.
4) first_order → second_order → third_order: each step follows from the last when possible.
5) reasoning_chain: full detail only — short sentences, payoff early.

Return the JSON object now.`;
}
