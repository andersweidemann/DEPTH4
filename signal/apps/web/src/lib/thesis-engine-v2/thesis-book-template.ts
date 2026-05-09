/**
 * DEPTH4 thesis **book** voice — global standard (QQQ / AI capex rewrite is the template, not a one-off).
 * Used by macro prompts when linking to catalog theses; Cursor rule expands the same contract.
 */

/** One-line hook example (3-second scan). */
export const DEPTH4_CANONICAL_QQQ_ONE_LINE =
  "Don't add to QQQ yet: many companies will feel the cost of AI spending in earnings before the profits show up, and the index hides that risk.";

export const DEPTH4_THESIS_BOOK_SNIPPET_FOR_LLM = `
DEPTH4 CATALOG THESIS VOICE (canonical QQQ / AI template — apply to EVERY linked thesis id)
1) TRADE LINE: "[Buy/Sell/Don't add / Don't buy more … yet] [ticker] because [future event] will happen within [time window] due to [plain cause], probability [N%]."
   - Never vague "avoid" without saying hold vs sell vs don't add.
   - Never unexplained "AI capex", "dispersion risk", "beta", "quality", "duration" alone — spell out in plain English (e.g. AI-related spending: chips, data centers, staff; long bond prices vs rate cuts).
2) FOUR LEVELS (thesis page / thesisCascade): L1 confirmed today · L2 this week or this quarter (near catalyst window) · L3 this year (1–3 quarters, flows, winners/losers) · L4 structural bias for the current year for ALL DEPTH4 theses (funding, energy, small caps, etc.). Plain sentences; 2–3 short lines per level.
3) MARKET EDGE (whatsUnpriced / misread tone): what the crowd misses; why DEPTH4 sees it first (clusters, levels, policy path) — no empty slogans.
4) TRIGGER / TRADE / EXIT / TIME STOP: observable trigger; trade names tickers and actions; invalidation states what proves you wrong; time stop if thesis never fires on schedule (e.g. two quarters / two earnings seasons).
5) IRAN BRIEF: short direct sentences; ban consultant deck speak.

CANONICAL ONE-LINE (QQQ — 3-second scan shape for any thesis)
"${DEPTH4_CANONICAL_QQQ_ONE_LINE}"
`.trim();

/**
 * When writing or updating `public.theses.body` (or a full `Thesis` JSON for discovery / admin),
 * enforce the same single-purpose fields as the web `Thesis` type and mock catalog.
 */
export const DEPTH4_THESIS_BODY_JSON_RULES_FOR_LLM = `
DEPTH4 THESIS BODY JSON (Supabase \`public.theses.body\` or equivalent) — NO DUPLICATION
- **title** / **thesis_statement**: the ONLY place for the full hero trade sentence (action + asset + because + time + cause + probability tone). Do not repeat that sentence in why_thesis_exists, thesis_cascade, whats_unpriced, trigger, or trade.
- **whats_unpriced**: ONE block for the variant read / “what the market hasn’t priced.” Fold legacy misread here; leave **market_misread** empty or omit.
- **thesis_cascade** (l1–l4): facts → near window → payout path → structural bias. No hero-title clone; no second copy of whats_unpriced.
- **trigger** / **trade** / **invalidation** / **time_stop**: each appears **once** in its own field. **trade** = actions in words; numeric entry/stop/targets live in entry_zone / stop / target fields, not repeated as a second trade essay.
- **why_thesis_exists**: 3–4 short paragraphs, framing ONLY (why the lens exists). Reference “see Trigger / Trade / Invalidation” instead of pasting them.
- **risk_factors**: summarize; **reference** Invalidation (“see Invalidation”) — never paste the full invalidation block again.
- **probability_rationale**: evidence / odds only — not a third copy of the hero line.
`.trim();
