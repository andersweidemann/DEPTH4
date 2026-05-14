# DEPTH4 Vision

## Product promise

DEPTH4 is a macro intelligence engine that turns messy real-world developments into **tradable theses** that think several moves ahead. It analyzes breaking news and macro developments, maps how they will propagate into assets, finds the mispricing, and formulates a thesis that a serious trader could act on. It analyses breaking geopolitical news and forecasts four levels of future ramifications on specific stocks and asset classes, then updates probability scores as new information emerges. All claims must be verified against multiple independent sources before they influence user-visible output.

## Who it is for

DEPTH4 is for serious market participants who need fast, differentiated, decision‑relevant thinking. They do not want generic analyst notes or headline rewrites; they want clear, causal theses with timing, conviction, and mispricing they can plug into a trade plan.

## Non‑negotiables

- Every visible thesis must contain **cause, path, timing, and market implication**.
- Generic summaries or simple headline rewrites are failure.
- If quality is weak, the system should **reject the output** instead of publishing it.
- The product must feel like an **intelligence engine**, not a news dashboard or RSS reader.
- Claims must be checked against multiple independent sources before they matter for probabilities or conviction.

## Source hierarchy — strict ranking

Treat sources in this order. Never rely on, or prominently cite, a lower‑tier source when a higher‑tier source is available for the same fact.

1. **Tier 1 — Primary:** AFP wire, Reuters, AP, named government officials on record, CENTCOM statements, ISW Special Reports.
2. **Tier 2 — Verified regional:** Anadolu Agency, ABC Australia live updates, Al Jazeera confirmed reporting, GMA Network live updates, Times of India live.
3. **Tier 3 — Analytical:** Iran International, Jerusalem Post live blog, ISW daily updates, Chatham House.
4. **Tier 4 — Market intelligence:** Argus Media, ING Think, TradingEconomics, Polymarket, Robinhood prediction markets.
5. **Tier 5 — Use with caution:** RT, PressTV, Mehr News, TASS — always cross‑reference with Tier 1–2 before acting, and flag the source explicitly when used.

RT and similar outlets are confirmed state media with editorial agendas. Any “verified fact” that originates from Tier 5 must have independent Tier 1–2 confirmation before it enters DEPTH4’s reasoning or thesis matrix.

## Geopolitical analysis framework — DEPTH4 four levels

For every major geopolitical development, analyse four levels:

- **Level 1 — Confirmed (0–24h):** What is verified by Tier 1–2 sources right now. Named officials on record. Confirmed events. No speculation.
- **Level 2 — This week (1–7 days):** Direct near‑term consequences. First-order market moves and specific catalysts over the coming days.
- **Level 3 — This month (7–30 days):** Structural implications and second‑order effects on policy, supply chains, currencies, and commodities.
- **Level 4 — This quarter (30–90+ days):** Systemic changes, geopolitical realignments, and long‑duration asset impacts (including Armstrong‑style cycle context where relevant).

A DEPTH4 thesis should make it clear which levels matter for the trade and where the real edge lives. The same story can be fully priced at Level 2 while the true edge survives at Level 3–4.

## How it works — from headline to trade plan

Most traders react to the first headline. DEPTH4 follows the full story arc so the user can see the second, third, and fourth moves before the market prices them in.

1. **Pick a thesis or create your own**  
   The user starts from DEPTH4’s live macro board — war risk, Fed policy, oil supply, AI earnings, etc. — or types an idea and lets the engine map it.

2. **DEPTH4 maps four future states**  
   Each thesis unfolds across confirmed facts, first market reaction, spillover effects, and systemic backdrop. The user sees the chain, not just the headline.

3. **Conviction and mispricing at every depth**  
   The engine estimates how likely the thesis is to play out (conviction) and where the market still looks behind at each step (mispricing). Probability scores update as new information arrives, instead of staying static.

4. **Trade the depth with the edge**  
   Entry, stop, and target levels are sketched for the most mispriced depth — not just the hero headline — and monitored with scenario‑based alerts as the story evolves.

## The DEPTH4 difference — think four moves ahead

Strong chess players see the sequence that follows. DEPTH4 does the same for macro shocks, mapping how each story unfolds across four future states so users see where the real edge lives.

Example structure for a rates thesis:

- **Level 1 · Confirmed (0–24h):**  
  “Fed pauses; statement verifies higher‑for‑longer bias.”  
  Wait for confirmation from Tier 1–2 sources, then consider sizing into the chain rather than front‑running rumours.

- **Level 2 · This week (1–7 days):**  
  “Rates reprice first; duration whipsaws as cuts drift.”  
  Duration reacts — e.g. TLT and curve proxies.

- **Level 3 · This month (7–30 days):**  
  “Spillovers hit funding and margins; credit and cyclicals diverge.”  
  Credit vs quality becomes the core axis if funding stays tight.

- **Level 4 · This quarter (30–90+ days):**  
  “Systemic shift: leadership rotates toward cashflows and defensives.”  
  Delayed cuts plus USD strength pressure duration and EM importers.

DEPTH4’s moat is **depth selection**: for any story, it identifies at which level the thesis is still mispriced and focuses the user there.

## Model usage

- Use the **best LLM (Opus)** for important analysis that needs high‑quality, four‑level reasoning, strict source handling, and user‑visible theses.
- Use cheaper LLMs (for example, Nvidia‑backed or smaller models) for low‑risk, non‑user‑facing tasks such as clustering, tagging, or draft generation that will be heavily filtered before surfacing.

## Phrasing and language

- Use **simple retail trading language** that is easy to understand and feels conversational but serious.
- Explain moves, not jargon.
- A good pattern is the “least bad exit” example: clear headline, concrete bullet points, and explicit “why this works” / “why this is costly” sections.

For example, a DEPTH4‑quality paragraph might look like:

> “Trump declares a ‘Phase 1 victory’: he claims to have destroyed Iran’s offensive capacity, protected allies, and kept oil flowing under American protection. Project Freedom stays active as a permanent armed escort operation, rebranded as a ‘freedom of navigation’ mission rather than a declared war. Iran keeps nominal Hormuz sovereignty but loses the practical ability to weaponise tolls or closures. There is no humiliating peace treaty; the long‑term problem is handed to the next administration.”

This tone is specific, political, and concrete, not generic.

## Failure modes

DEPTH4 must actively avoid:

- Rewriting or paraphrasing headlines.
- Static thesis pages despite live inputs.
- Generic analyst‑note tone.
- Vague scenario language without a clear, tradable implication.
- Over‑confident probabilities that do not react as new information arrives.
- Any thesis that could have been produced by a generic “AI market news summary” tool.

## Release standard

A feature is not done unless it **strengthens the visible intelligence loop and preserves trust**. If a change makes the product feel more clever but less trustworthy or less differentiated, it should not ship.
