/**
 * DEPTH4 thesis **book** voice — global standard (QQQ / AI capex rewrite is the template, not a one-off).
 * Used by macro prompts when linking to catalog theses; Cursor rule expands the same contract.
 */

/** One-line hook example (3-second scan). */
export const DEPTH4_CANONICAL_QQQ_ONE_LINE =
  "QQQ will underperform as AI spending squeezes margins before revenue catches up — the index hides who pays first.";

export const DEPTH4_THESIS_BOOK_SNIPPET_FOR_LLM = `
DEPTH4 CATALOG THESIS VOICE (canonical QQQ / AI template — apply to EVERY linked thesis id)
1) HERO / TRADE LINE (title + thesis_statement — market forecast, NOT advice): "[Asset] will [direction + move] because [plain cause] within [time window], probability [N%]."
   - Asset first (ticker or common name). Then direction: will rise, will fall, will rerate higher, will stay bid, will underperform, will stay under pressure, will lag, etc.
   - **Banned in hero/title/one-line summary:** Buy, Sell, Go long, Go short, Add exposure, Reduce exposure, Don't buy, Don't add (and similar imperatives). Those belong only in Trade plan / execution fields.
   - Never unexplained "AI capex", "dispersion risk", "beta", "quality", "duration" alone — spell out in plain English (e.g. AI-related spending: chips, data centers, staff; long bond prices vs rate cuts).

====================================================
GLOBAL RULE — thesisCascade (L1–L4): PLAIN LANGUAGE ONLY
====================================================
Write **all four** levels for a **smart non-professional**. No level may use hedge-fund or bank memo jargon. 1–3 short sentences per level; **one main new idea per level**; name the **actual asset and driver** (GLD, USO, TLT, RTX, HG, META, QQQ, etc.).

LEVEL 1 — CONFIRMED (TODAY)
- What is already true right now: facts in today’s tape or data. No predictions.

LEVEL 2 — THIS WEEK / QUARTER
- What to watch in the current earnings or news window; the first place the thesis might show up in headlines or price.

LEVEL 3 — THIS YEAR
- How the trade plays out over the next 1–3 quarters; how winners vs losers separate; what that means for the **named asset**.

LEVEL 4 — 2026 BACKDROP
- Structural tilt for **all** DEPTH4 theses this year — background bias that makes some trades easier and some harder (not a far-future essay).

PLAIN LANGUAGE (EVERY LEVEL)
A. Simple, concrete words. Allowed examples: index, earnings, margins, cash flow, rates, war risk, hedges, order book, ads, shipping, rigs — always tied to the ticker or driver.
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

3) MARKET EDGE (whatsUnpriced / misread tone): what the crowd misses; why DEPTH4 sees it first (clusters, levels, policy path) — no empty slogans.
4) TRIGGER / TRADE / EXIT / TIME STOP: observable trigger; trade names tickers and execution framing (Enter / Trim / etc., informational disclaimer applies); invalidation states what proves you wrong; time stop if thesis never fires on schedule (e.g. two quarters / two earnings seasons).
5) DEPTH4 retail voice: short direct sentences; pass the DEPTH4 RETAIL VOICE TEST (see depth4-retail-voice-constitution module, injected with macro prompts); ban consultant deck speak.

CANONICAL ONE-LINE (QQQ — 3-second scan shape for any thesis)
"${DEPTH4_CANONICAL_QQQ_ONE_LINE}"
`.trim();

/**
 * When writing or updating `public.theses.body` (or a full `Thesis` JSON for discovery / admin),
 * enforce the same single-purpose fields as the web `Thesis` type and the shipped catalog baseline.
 */
export const DEPTH4_THESIS_BODY_JSON_RULES_FOR_LLM = `
DEPTH4 THESIS BODY JSON (Supabase \`public.theses.body\` or equivalent) — NO DUPLICATION
- **title** / **thesis_statement**: the ONLY place for the full hero forecast sentence (asset + will [move] + because + time + cause + probability tone). No Buy/Sell imperatives. Do not repeat that sentence in why_thesis_exists, thesis_cascade, whats_unpriced, trigger, or trade.

- **thesis_cascade** (l1–l4) — when generating or refreshing, follow ALL of the below (global: war/peace gold GLD, OPEC/USO, Fed/TLT, RTX/defense, copper/China, META/regulation, any future thesis):
  A. Instruct explicitly: write **all four** levels in plain language for a **smart non-professional**. Do **not** use hedge-fund or bank jargon (e.g. dispersion, index diversification, basket repricing, cash conversion, equity books, beta, duration, regime, setup as trade noun, expression as jargon).
  B. Prefer short, concrete sentences that name the **actual asset** and **driver** (ticker, earnings window, policy, routes, etc.).
  C. Use the **CANONICAL thesisCascade (QQQ)** block in the THESIS BOOK snippet above as the **positive pattern** — same rhythm and specificity; swap in the correct asset and thesis mechanics.
  D. **One new idea per level:** L1 = today’s facts only · L2 = what to watch this week / this earnings window · L3 = how the trade plays out over the year for the named asset · L4 = structural bias for 2026 across all DEPTH4 theses. No hero-title clone; no second copy of whats_unpriced.
  E. Facts → near window → payout path → structural bias; **plain retail English only**. See THESIS BOOK for banned list and NOT ALLOWED examples.

- **whats_unpriced**: ONE block for the edge — **what the market hasn't priced yet** — in plain words (do not use "variant read" / "variant perception"). Fold legacy misread here; leave **market_misread** empty or omit.
- **trigger** / **trade** / **invalidation** / **time_stop**: each appears **once** in its own field. **trade** = actions in words; numeric entry/stop/targets live in entry_zone / stop / target fields, not repeated as a second trade essay.
- **why_thesis_exists**: 3–4 short paragraphs, framing ONLY (why the lens exists). Reference "see Trigger / Trade / Invalidation" instead of pasting them.
- **risk_factors**: summarize; **reference** Invalidation ("see Invalidation") — never paste the full invalidation block again.
- **probability_rationale**: evidence / odds only — not a third copy of the hero line.
`.trim();
