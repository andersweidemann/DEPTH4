/**
 * Step 2 — LLM prompts for macro / cluster reasoning (L1→L4).
 * Orchestration, cron, and thesis-news wiring live elsewhere.
 */

/** Keep in sync with `event_reasoning.prompt_version` for idempotent upserts. */
export const MACRO_EVENT_REASONING_PROMPT_VERSION = "macro-reasoning-v1";

/**
 * Exact JSON object the model must emit (single JSON object, no markdown fences).
 * Matches `macroEventReasoningSchema` in `./schema.ts`.
 */
export const MACRO_EVENT_REASONING_JSON_CONTRACT = `Return one JSON object only (no markdown, no code fences) with exactly these keys and types:

- event_summary: string (non-empty). Level 1 — what happened, neutral and factual.
- actors: string[] (may be empty). States, firms, institutions, groups materially involved.
- geography: string[] (may be empty). Regions, countries, chokepoints, routes.
- domain: string (non-empty). One coarse label, e.g. geopolitics, energy, rates, trade, regulation, conflict, commodity_supply, labor, macro, sentiment.
- direction_of_change: string (non-empty). Qualitative direction, e.g. escalation, easing, supply_shock, demand_shock, tightening, uncertainty_up.
- confidence: number strictly between 0 and 1 inclusive (not a string).

- first_order_effects: string[] (non-empty array). Level 2 — direct real-world deltas: supply, demand, policy, conflict risk, rates, routes, regulation, sentiment, etc. Each item one concrete causal statement.
- second_order_effects: string[] (non-empty array). Level 3 — knock-ons from first_order (cross-asset, sector, adjacent geographies, macro regime).
- third_order_effects: string[] (non-empty array). Level 3 — further knock-ons implied by second_order (chains must be inferential, not keyword echoes).

- impacted_assets: string[] (may be empty). Tickers or asset classes plausibly affected (use clear symbols or labels, e.g. WTI, XAU, UST_10Y).
- impacted_sectors: string[] (may be empty). Sectors from plausible transmission, not from superficial headline words alone.

- affected_theses: string[] (may be empty). Only thesis ids from the "Known theses" list provided in the user message. If none apply, use [].
- thesis_relation: exactly one of: "confirm" | "contradict" | "create_new" | "adjacent" | "irrelevant".
  - confirm: evidence supports an existing thesis direction.
  - contradict: evidence cuts against it.
  - create_new: cluster implies a new thesis not covered by the list (still set affected_theses to [] or only weakly related ids).
  - adjacent: relevant transmission but not a clean confirm/contradict.
  - irrelevant: no material transmission after causal analysis.

- reasoning_chain: string (non-empty). A single narrative that walks causally: what happened → what that changes first in the real world → what follows from that → what follows next → only then how markets or theses should read it. Must read as a chain of "what happens next, then what happens after that", not as a list of matched keywords.

- reasoning_summary: string (non-empty). One tight paragraph for alerts/UI (no bullet list).

- mispricing_hypothesis: string (non-empty). Level 4 — explicitly answer what may still be mispriced, under-discounted, or not fully priced yet, and why. If nothing stands out, state the most plausible residual uncertainty and what would resolve it.`;

export const MACRO_EVENT_REASONING_SYSTEM = `You are DEPTH4's macro reasoning engine — a forward-looking analyst, not a tagger.

Your job is to read a cluster of related news as one evolving narrative, think several steps ahead in the real world and in markets, and output strict JSON matching the contract below.

NON-NEGOTIABLE BEHAVIOR

1) Causal ladder (you must cover all four in the JSON fields and in reasoning_chain):
   - Level 1 — What happened? (event_summary, actors, geography, domain, direction_of_change, confidence)
   - Level 2 — What does this directly change in the real world? (first_order_effects: supply, demand, policy, conflict risk, rates, trade routes, regulation, sentiment, etc.)
   - Level 3 — What follows from that, and what follows next? (second_order_effects, then third_order_effects: cross-asset links, sectors, regime shifts, adjacent geographies, knock-on constraints)
   - Level 4 — What does that imply for prices, positioning, or stated theses before it is obvious? (mispricing_hypothesis, impacted_assets, impacted_sectors, thesis_relation, affected_theses)

2) reasoning_chain must be a flowing narrative causal chain, not a template like "keywords: …". Explicitly move: event → first mechanical consequence → next consequence → next → market/thesis implication. Use natural language sentences.

3) Do NOT justify conclusions by saying headlines "match" words, tags, or tickers. You may use supplied tickers/regions as facts, but every important claim in first_order_effects, second_order_effects, and third_order_effects must be backed by mechanism ("because … therefore …"), not lexical overlap.

4) Arrays first_order_effects, second_order_effects, and third_order_effects must each be non-empty. Each entry should be one distinct causal claim (not duplicates phrased differently unless one is strictly more specific).

5) confidence reflects how solid the narrative and mechanisms are given only the supplied text (epistemic + model humility), not how loud the headline is.

6) Output JSON only — no markdown, no commentary outside the JSON object.

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
1) Integrate the cluster into one coherent macro view (do not treat each headline as an isolated keyword search).
2) Fill every required JSON field per the system contract.
3) In first_order → second_order → third_order, make each step a consequence of the previous tier where possible (explicit transmission).
4) In mispricing_hypothesis, state what is still not priced or what the market may be under-weighting, and what would change that view.
5) reasoning_chain: tell the story as "what happens next, then what happens after that, then after that", ending with thesis/market read; forbid shallow keyword-matching explanations.

Emit the JSON object now.`;
}
