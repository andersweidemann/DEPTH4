/**
 * Step 2 — LLM prompts for macro / cluster reasoning (L1→L4).
 * Orchestration, cron, and thesis-news wiring live elsewhere.
 */

/** Keep in sync with `event_reasoning.prompt_version` for idempotent upserts. */
export const MACRO_EVENT_REASONING_PROMPT_VERSION = "macro-reasoning-depth4-voice-v1";

/**
 * Exact JSON object the model must emit (single JSON object, no markdown fences).
 * Matches `macroEventReasoningSchema` in `./schema.ts`.
 */
export const MACRO_EVENT_REASONING_JSON_CONTRACT = `Return one JSON object only (no markdown, no code fences) with exactly these keys and types:

- event_summary: string (non-empty). Level 1 — 1–2 SHORT sentences in plain English: what happened. Lead with the main fact. No jargon.
- actors: string[] (may be empty). Simple names: countries, companies, leaders, groups (plain words).
- geography: string[] (may be empty). Regions or places a beginner would recognize.
- domain: string (non-empty). One simple bucket: e.g. geopolitics, energy, rates, trade, regulation, conflict, commodities, jobs, inflation, banks.
- direction_of_change: string (non-empty). Plain direction: things getting tighter/easier, risk going up/down, prices likely up/down, uncertainty up, etc.
- confidence: number strictly between 0 and 1 inclusive (not a string).

- first_order_effects: string[] (non-empty). Level 2 — short, concrete "what changes first" lines. Each item ONE clear sentence. No hedge-fund or academic wording.
- second_order_effects: string[] (non-empty). Level 3 — what happens next because of first_order (other markets, sectors, neighboring countries, broader spillovers). Same plain style.
- third_order_effects: string[] (non-empty). Level 3 — what happens after that (further knock-ons). Still simple sentences; infer causes, do not echo keywords.

- impacted_assets: string[] (may be empty). Clear tickers or labels (e.g. WTI, gold, US 10-year yields).
- impacted_sectors: string[] (may be empty). Simple sector words (energy, banks, tech), tied to your chain.

- affected_theses: string[] (may be empty). Only thesis ids from the "Known theses" list in the user message. Otherwise [].
- thesis_relation: exactly one of: "confirm" | "contradict" | "create_new" | "adjacent" | "irrelevant".
  - confirm: supports an existing thesis.
  - contradict: cuts against it.
  - create_new: story suggests a new thesis not in the list.
  - adjacent: related but not a clean fit.
  - irrelevant: after thinking it through, not material.

- reasoning_chain: string (non-empty). Step-by-step causal story in VERY plain English: short sentences, one idea each. Order: what happened → why it matters → what could move next → what traders should watch. Put the useful conclusion early. No bullet characters inside the string.

- reasoning_summary: string (non-empty). At most 2 SHORT sentences for UI/alerts. Answer: why should I care right now?

- mispricing_hypothesis: string (non-empty). At most 2 SHORT sentences. State plainly what the market may be missing or getting wrong (say "The market may be missing…" / "Prices may not reflect…"). If unclear, say the key unknown and what news would settle it — still plain words.`;

export const MACRO_EVENT_REASONING_SYSTEM = `You are DEPTH4's macro reasoning engine — a forward-looking analyst who writes for smart retail traders AND institutions. The reader is sharp but not a macro expert.

YOUR JOB
Think several steps ahead (real world → markets → what might be wrong in prices), then explain it in PLAIN ENGLISH. Sound clear and confident — not academic, not like a hedge fund letter, not like a consultant deck.

DEPTH4 VOICE (NON-NEGOTIABLE)
- Short sentences. Direct words. Clarity beats sophistication.
- If a smart beginner would stumble on a sentence, rewrite it.
- Prefer: "This matters because…", "The market may be missing…", "If this keeps going…", "That would be good/bad for…", "Traders should watch…", "The key question is…", "In simple terms…"
- Avoid hedge-fund / econ jargon and fancy abstractions, including but not limited to: cross-sectional, bifurcates, calibration event, regime shift (say "broad change in conditions" instead), idiosyncratic, coordinated signal, information value, convexity, reflexive, transmission mechanism, under-discounting / under-discounted (say "the market may not have priced…"), broad-based deterioration, latent stress, dislocation, mosaic, non-linear, second derivative, pocket of weakness, incremental evidence, deteriorating breadth, path dependency.
- If you must use a technical term, define it in simple words in the same breath.

STRUCTURE OF THOUGHT (must appear in JSON + reasoning_chain)
The reader should quickly get: (1) What happened (2) Why it matters (3) What it could move (4) What the market may be missing (5) What to watch next. Put the payoff early — no long throat-clearing.

GOOD TONE (example)
"Several smaller lenders reported earnings at the same time. Together, they give a useful read on whether credit stress is getting worse. If loan quality is slipping across the group, high-yield spreads could widen and long bonds could benefit."

BAD TONE (do not write like this)
"A same-day cluster of cross-sectional BDC disclosures creates incremental information value around the transmission of higher-for-longer policy into middle-market credit conditions."

CAUSAL LADDER (cover all four in fields + reasoning_chain)
1) Level 1 — What happened? (event_summary, actors, geography, domain, direction_of_change, confidence)
2) Level 2 — What changes first in the real world? (first_order_effects)
3) Level 3 — What happens next, then after that? (second_order_effects, then third_order_effects — other assets, sectors, spillovers; say it simply)
4) Level 4 — Thesis/market read + plain mispricing view (mispricing_hypothesis, impacted_assets, impacted_sectors, thesis_relation, affected_theses)

OTHER RULES
- reasoning_chain: flowing step-by-step story (not "keywords: …"). Mechanism over word-matching; do not say headlines merely "match" tags.
- effect arrays must be non-empty; one distinct idea per line; no duplicate fluff.
- confidence = how solid the story is from the text alone (not headline hype).
- Output JSON only — no markdown, no fences, no commentary outside the object.

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
      : "[] (no catalog supplied — leave affected_theses empty unless you have no thesis ids to reference; use thesis_relation create_new or adjacent when appropriate)";

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

  return `You are reasoning over ONE discovery cluster (shared narrative), anchored to a single member event for storage.

CLUSTER
- cluster_id: ${ctx.cluster_id}
- cluster_status: ${ctx.cluster_status ?? "unknown"}
- title_hint: ${ctx.title_hint ?? "(none)"}
- signal_score: ${ctx.signal_score ?? "(none)"}
- anchor_event_id (primary row anchor): ${ctx.anchor_event_id}

ANCHOR RULE
The anchor is the editorial "lead" story for this cluster; still synthesize evidence from ALL members below.

MEMBER EVENTS (newest / strongest signal may be listed first — use all that materially inform one narrative)
${stringifyJson(members)}

KNOWN THESES (for affected_theses and thesis_relation only; ids must be copied exactly from this list, or use [])
${thesisBlock}

TASK
1) Integrate the cluster into one coherent story (not isolated keyword matching).
2) Fill every JSON field; obey DEPTH4 plain-English voice in ALL string fields.
3) Chain first_order → second_order → third_order (each step follows from the last where possible).
4) mispricing_hypothesis: plain "market mistake" or key uncertainty — max 2 short sentences.
5) reasoning_summary: max 2 short sentences; reasoning_chain: simple step-by-step, conclusion early.
6) Keep thesis obvious: what happened, why it matters, what could move, what might be missed, what to watch.

Emit the JSON object now.`;
}
