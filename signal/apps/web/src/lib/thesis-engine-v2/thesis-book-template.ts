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
