/**
 * DEPTH4 thesis **book** voice — global standard (QQQ / AI capex rewrite is the template, not a one-off).
 * Used by macro prompts when linking to catalog theses; Cursor rule expands the same contract.
 */

/** One-line hook example (3-second scan). */
export const DEPTH4_CANONICAL_QQQ_ONE_LINE =
  "QQQ will underperform as AI spending squeezes margins before revenue catches up — the index hides who pays first.";

export const DEPTH4_THESIS_BOOK_SNIPPET_FOR_LLM = `
DEPTH4 CATALOG THESIS VOICE (canonical QQQ / AI template — apply to EVERY linked thesis id)
1) HERO / TRADE LINE (title + thesis_statement — market forecast, NOT advice): "[Asset] will / should [direction + move] because [plain cause] within [time window]." **Do not** append ", probability [N%]" or any other literal percent — conviction is rendered only by the product UI.
   - Asset first (ticker or common name). Then direction: will rise, will fall, will rerate higher, will stay bid, will underperform, will stay under pressure, will lag, etc.
   - **Banned in hero/title/one-line summary:** Buy, Sell, Go long, Go short, Add exposure, Reduce exposure, Don't buy, Don't add (and similar imperatives). Those belong only in Trade plan / execution fields.
   - Never unexplained "AI capex", "dispersion risk", "beta", "quality", "duration" alone — spell out in plain English (e.g. AI-related spending: chips, data centers, staff; long bond prices vs rate cuts).
   - **Frozen spot / index prices:** do not bake exact price levels into hero, summaries, cascades, scenarios, feed teasers, or body prose. Use timeless wording ("Gold still prices war risk") unless the number is live market data rendered at display time. **entry_zone / stop / target** in JSON are for Trade-plan levels **kept current from quotes or omitted** — not stale snapshot literals in shipped defaults.

====================================================
GLOBAL RULE — thesisCascade (L1–L4): PLAIN LANGUAGE ONLY
====================================================
Write **all four** levels for a **smart non-professional**. No level may use hedge-fund or bank memo jargon. 1–3 short sentences per level; **one main new idea per level**; name the **actual asset and driver** (GLD, USO, TLT, RTX, HG, META, QQQ, etc.).

LEVEL 1 — CONFIRMED (TODAY)
- What is already true right now: facts in today’s tape or data. No predictions.

LEVEL 2 — THIS WEEK / QUARTER
- What to watch in the current policy, credit, or earnings window — **macro and sector channels**, not per-ticker price leadership.

LEVEL 3 — THIS YEAR
- How the **macro channel** pays out over the next 1–3 quarters (supply chains, curves, broad sector repricing). **Do not** park warehouse-level or single-ticker “who leads first” detail here — that belongs in structured **related_assets** / Asset Edge Map rows.

LEVEL 4 — 2026 BACKDROP
- Structural tilt for **all** DEPTH4 theses this year — background bias that makes some trades easier and some harder (not a far-future essay).

PLAIN LANGUAGE (EVERY LEVEL)
A. Simple, concrete words. Allowed examples: index, earnings, margins, cash flow, rates, war risk, hedges, order book, ads, shipping, rigs — tie drivers to **sectors and macro channels**; name a ticker in cascade **only** when it is the unavoidable fact in L1 (e.g. a confirmed filing line), not for trade-expression detail.
B. Explain so a reader can **visualize** the idea (e.g. "Owning everything hides which stocks are cracking first." / "Borrowing is still expensive, so weak balance sheets get hit first."). No internal shorthand that needs a bank background.
C. Do **not** restate the hero title line; each level adds something new.

**Banned in L1–L4 and all user-facing thesis fields** (rewrite in plain English): dispersion, index diversification, basket repricing / reprices cleanly, cash conversion, conversion quality, equity books, book bias, beta, duration, regime, setup (as noun), convexity, expression (as trade jargon), variant read / variant perception, sell-side models, backlog math, time compression, flow story, cross-sectional, transmission, mosaic, dislocation, incremental (as filler), path dependency, factor jargon, or any phrase that sounds like an internal risk report.

**NOT ALLOWED (never imitate this tone in any level):**
- "Index diversification blurs single-name margin signals until earnings cluster; dispersion shows up before the basket reprices cleanly."
- "Expensive capital keeps punishing weak cash conversion first — that bias threads through equity books this year."

CANONICAL thesisCascade — QQQ (AI costs before AI profits) — copy this **shape** for GLD, USO, TLT, RTX, HG, META, any future thesis

L1 · CONFIRMED (TODAY) — What is already true
AI-related spending is already ramping: chips, data centers, and headcount. Big tech guides show the bill is here, not someday.

L2 · THIS WEEK / QUARTER — Headlines, earnings window, first tape move
In this earnings window, a cluster of margin cuts tied to AI spend is the tell. One soft guide is noise; several in the same two weeks is the pattern.

L3 · THIS YEAR — How the trade pays out across the calendar
Owning the whole index hides which stocks are cracking first. A few clear AI winners will carry the story while a long tail of "AI noise" names see margins weaken, so broad QQQ is riskier than it looks.

L4 · 2026 BACKDROP — Bias for every DEPTH4 thesis this year
Money is still expensive. Companies that throw off steady cash can fund AI and earn real returns. Weaker or more indebted names have to spend just to keep up and get punished faster when profits slip.

3) MARKET EDGE: ship **structured related_assets** (3–5+ tickers) for the Asset Edge Map — each row MUST include why_it_matters, consensus_on_asset, what_asset_misprices, edge_window, depth_confidence (no duplicate symbols under aliases). **whats_unpriced** is optional when those rows exist; if present, keep it thesis-timing only — do not paste the same sentences into edge rows. Legacy one-block whats_unpriced is allowed only when related_assets are absent.
4) TRIGGER / TRADE / EXIT / TIME STOP: observable trigger; trade names tickers and execution framing (Enter / Trim / etc., informational disclaimer applies); invalidation states what proves you wrong; time stop if thesis never fires on schedule (e.g. two quarters / two earnings seasons).
5) DEPTH4 retail voice: short direct sentences; pass the DEPTH4 RETAIL VOICE TEST (see depth4-retail-voice-constitution module, injected with macro prompts); ban consultant deck speak.

6) SCENARIO VIEW — RESOLUTION PATHS (same trade, three outcomes; not Base/Bull/Bear alternate bets)
- Exactly three paths with labels clean_win / messy_win / thesis_broken (display: "Clean win", "Messy win", "Thesis broken"), each with **structured** probability (sum ~100%) in JSON fields, plus what_happens and consequence_for_trade **without** repeating those percents inside the prose — the Scenario View UI shows the bars.
- All three are conditional on the **current** thesis direction (long or short). Do not propose unrelated entry trades. Do not contradict the hero forecast.
- **Each path must describe a different causal chain** (policy vs physical vs cross-asset stress, etc.), not three timing variants of the same story. Consequences should name **specific instruments** (e.g. HG, FCX, TLT, USOIL, META) and actions (scale, trim, cover, wait) tied to Trade plan / Invalidation / Book.
- Consequence must reference Trade plan, Invalidation, Book where appropriate — thesis-specific, not copy-paste templates.

CANONICAL ONE-LINE (QQQ — 3-second scan shape for any thesis)
"${DEPTH4_CANONICAL_QQQ_ONE_LINE}"
`.trim();

/**
 * When writing or updating `public.theses.body` (or a full `Thesis` JSON for discovery / admin),
 * enforce the same single-purpose fields as the web `Thesis` type and the shipped catalog baseline.
 */
export const DEPTH4_THESIS_BODY_JSON_RULES_FOR_LLM = `
DEPTH4 THESIS BODY JSON (Supabase \`public.theses.body\` or equivalent) — NO DUPLICATION
- **title** / **thesis_statement**: the ONLY place for the full hero forecast sentence (asset + will [move] + because + time + cause). **No literal NN%** in that sentence; no Buy/Sell imperatives. Do not repeat that sentence in why_thesis_exists, thesis_cascade, whats_unpriced, trigger, or trade.

- **thesis_cascade** (l1–l4) — when generating or refreshing, follow ALL of the below (global: war/peace gold GLD, OPEC/USO, Fed/TLT, RTX/defense, copper/China, META/regulation, any future thesis):
  A. Instruct explicitly: write **all four** levels in plain language for a **smart non-professional**. Do **not** use hedge-fund or bank jargon (e.g. dispersion, index diversification, basket repricing, cash conversion, equity books, beta, duration, regime, setup as trade noun, expression as jargon).
  B. Prefer short, concrete sentences that name **macro channels** (policy, credit, physical supply, regulation) and sector read-throughs; **per-ticker mispricing** belongs in structured **related_assets**, not in cascade paragraphs.
  C. Use the **CANONICAL thesisCascade (QQQ)** block in the THESIS BOOK snippet above as the **positive pattern** — same rhythm and specificity; swap in the correct macro mechanics.
  D. **One new idea per level:** L1 = today’s facts only · L2 = what to watch this week / this earnings window · L3 = how the **macro channel** pays over the year · L4 = structural bias for 2026 across all DEPTH4 theses. No hero-title clone; no second copy of whats_unpriced; **keep L2–L4 on macro timeline — do not park warehouse-level or per-ticker edge in cascade (that belongs in structured related_assets / edge map).**
  E. Facts → near window → payout path → structural bias; **plain retail English only**. See THESIS BOOK for banned list and NOT ALLOWED examples.

- **whats_unpriced**: Optional when **related_assets** holds 3–5+ structured edge rows; if used, thesis-level timing/framing only — **never** duplicate per-asset consensus/mispricing text that belongs in edge-map rows. Otherwise ONE block for the edge in plain words (do not use "variant read" / "variant perception"). Fold legacy misread here; leave **market_misread** empty or omit.
- **trigger** / **trade** / **invalidation** / **time_stop**: each appears **once** in its own field. **trade** = actions in words; numeric entry/stop/targets belong in **entry_zone / stop / target** only when maintained from current market data (or omit). Do not repeat those numbers as a second trade essay in prose fields; do not store one-off spot quotes that will read wrong next week.
- **why_thesis_exists**: 3–4 short paragraphs, framing ONLY (why the lens exists). Reference "see Trigger / Trade / Invalidation" instead of pasting them.
- **risk_factors**: summarize; **reference** Invalidation ("see Invalidation") — never paste the full invalidation block again.
- **probability_rationale**: evidence / odds only — not a third copy of the hero line.
- **scenario_view / resolution paths** (when generating structured scenario JSON): use the clean_win / messy_win / thesis_broken contract above; **each path = a different causal chain**, not three timing variants; consequences name tickers and actions (scale, trim, cover) tied to Trade plan / Invalidation / Book; map any legacy Base/Bull/Bear copy to messy/clean/broken semantics before returning.
`.trim();

/**
 * **V2 — canonical four-depth engine** (same semantics as homepage “think ahead” once UI is unified).
 * Replace legacy “Confirmed / Week–Quarter / Year / 2026 backdrop” prose with **structured nodes** + per-depth mispricing.
 * Emit JSON key `thesis_depth_book` (sibling to `thesis_cascade` during migration) matching `ThesisDepthBook` in
 * `thesis-depth-canonical.ts`.
 */
export const DEPTH4_THESIS_DEPTH_V2_CONTRACT_FOR_LLM = `
====================================================
DEPTH4 THESIS_DEPTH_BOOK (canonical four depths) — STRUCTURED JSON
====================================================
One object thesis_depth_book with:
- version: 1 (integer)
- lastComputedAt: ISO string or generation tag
- nodes: object with keys depth_1, depth_2, depth_3, depth_4. Each node MUST include:
  - id (same as key)
  - claim (string)
  - timeframe (string; use canonical windows: depth_1 = 0–24h confirmed; depth_2 = 1–7d direct; depth_3 = 7–30d spillover; depth_4 = 30–90d+ systemic)
  - confidence (0–1)
  - evidence (string[])
  - dependencyOnPriorLevel (string; empty for depth_1)
  - affectedAssets (string[] tickers/sectors)
  - expectedDirection: bullish | bearish | mixed | neutral (for the **primary expression at this depth**, which may differ from hero asset)
  - candidateMarketProxies (string[] — what observable series proxy “market priced”)
  - whatMarketProbablyPricesNow (string)
  - whatDepth4ThinksIsMoreLikely (string)
  - whyTheGapExists (string)
- mispricingByDepth: same four keys; each MUST include:
  - depthId
  - depth4Probability (0–1)
  - marketImpliedProbability (0–1 or null if unknown)
  - marketProxyAssessment (string — required when numeric implied null)
  - gap (number or null) = depth4 − market when both numeric
  - confidenceAdjustedGap (number or null)
  - catalystClarity (0–1)
  - expressibility (0–1)

PRODUCT RULE — trade may NOT be hero asset:
- If depth_2 (direct) is violently repriced, raise expressibility at depth_3/depth_4 and surface second/third-order trades
  (e.g. fertilizer vs airlines; EM importers; duration) even when hero is crude.

CANONICAL EXAMPLE — Hormuz closed after clash (illustrative; do not paste verbatim unless event matches):
- depth_1.claim: "Hormuz traffic disruption is verified by Tier 1 sources."
- depth_2.claim: "Front crude, tanker rates, and shipping insurance jump."
- depth_3.claim: "Higher energy costs feed into diesel, fertilizer, ag inputs, airline margins, EM importer stress."
- depth_4.claim: "Sticky inflation delays cuts, strengthens energy exporters/defense, hurts importers and duration."

Legacy thesis_cascade may remain for one release; prefer filling thesis_depth_book for all new/edited rows.
`.trim();
