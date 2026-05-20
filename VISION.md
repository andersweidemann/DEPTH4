# DEPTH4 Vision

## What DEPTH4 Is

DEPTH4 is a macro intelligence engine that reads the news, maps how stories cascade through markets, and turns narratives into tradeable theses with probabilities, mispricing scores, price levels, and early-warning signals.

The core insight: **prices don't move because of headlines — they move because of chains of consequences that most traders never trace.** A Fed pause headline moves bonds. But the real edge is in credit spreads tightening the following month, and leadership rotating to cash-flow names for the quarter. Most traders stop at the headline. DEPTH4 follows the full chain.

## What DEPTH4 Does

The platform reads headlines, runs incentive analysis, detects mispricings, and **generates theses automatically**. Users review AI-generated theses, star them, or create personal overlays — but the engine **never offloads thesis creation to the user** as the default path.

- **No raw news without analysis.** Headlines appear only after they've been processed through the full pipeline: event detection → incentive analysis → causal propagation → thesis generation → quality gate.

## What DEPTH4 Does NOT Do

- Delegate core thesis creation to users ("create a thesis for this implied asset").
- Surface raw headlines or wire items that have not been analyzed and mapped.
- Use the feed as a discovery lane for manual gap-filling the AI should have closed.

## The Feed: AI Activity Dashboard

The feed exists for one purpose: **prove the engine is working.** It shows:

- **Thesis updates** — re-model events (probability shifts, trade plan changes, "what changed" summaries)
- **New thesis creation** — AI-generated theses from breaking news
- **Status transitions** — watching → active → resolved → archived
- **Key evidence** — significant headlines that triggered a re-model

The feed does **not** show:

- Implied asset lists requiring manual thesis creation
- Raw news without analysis
- User action prompts ("create thesis for X")

If implied asset relationships are valuable, they appear on the **thesis detail page** under a collapsible **"Implied moves"** section. The AI auto-creates a thesis if the implied move crosses significance thresholds.

## Two Types of Theses

| Type | Created by | Purpose |
|------|------------|---------|
| **AI-generated** | DEPTH4 pipeline | Core intelligence product — reads news, creates theses automatically |
| **User-created** | User | Personal conviction trades, overrides, or niche theses the AI hasn't found |

User-created theses get the same AI treatment (`populateUserThesisBody`, continuous re-modeling via evidence cascade). They are not second-class — they're **personal overlays** on the AI-generated base.

## Two-Shell Layout

**Marketing shell** (`/` homepage):

- Hero + proof sections
- No auth required
- Converts visitors to signups

**App shell** (`/theses`, `/feed`, `/book`, …):

- Top navigation: Theses · Feed · Positions · Community · Leaderboard · Help
- Content area with thesis cards, feed, causal graph
- Auth required for write actions; **public read mode** for visitors (view-only)

## Core Value Proposition

DEPTH4 reads thousands of headlines so you don't have to. It turns news into structured macro theses with trade plans, tracks them as evidence arrives, and tells you what changed. The user reviews, refines, and acts — **but never starts from zero.**

---

## The Two Dimensions of Depth

DEPTH4 operates across two dimensions of analysis. The product name literally refers to this dual-depth system:

### Dimension 1: Time Depth (THE FOUR-LEVEL CASCADE)

How a story unfolds across the calendar:

| Level | Timeframe | What It Tracks |
|-------|-----------|---------------|
| L1 | Confirmed (now) | What is already true — verified facts |
| L2 | This week (1-7d) | First market reaction, headline repricing |
| L3 | This month (7-30d) | Second-order spillovers, cross-asset effects |
| L4 | This quarter (30-90d+) | Systemic shifts, regime changes |

**Status:** Built and live. Every thesis has a four-level cascade showing how the story plays out over time.

### Dimension 2: Asset Depth (THE CAUSAL CHAIN) ← NEW

How a story ripples through interconnected markets:

| Depth | Relationship | What It Tracks |
|-------|-------------|---------------|
| Root | Thesis → Event | What macro event triggered this thesis |
| Direct | Thesis → Asset | Primary instrument the thesis targets |
| Indirect | Thesis → Affects | Secondary assets the thesis ripples into |
| Speculative | Thesis → Implied | Third-order effects with weak signal |

**Status:** Under development. This is the next major product evolution.

### The 4×4 Matrix

The true power comes at the intersection:

```
                    L1 (now)   L2 (week)   L3 (month)   L4 (quarter)
                   ┌─────────┬───────────┬────────────┬─────────────┐
Root (thesis)     │ GLD fade│ Entry     │ 1st target │ Full unwind │
                  │  now    │ window    │ hit        │ scenario    │
                  ├─────────┼───────────┼────────────┼─────────────┤
Direct (GLD,IAU)  │ Confirmed│ ETF flows │ Premium    │ Calendar    │
                  │ talks   │ react     │ leak       │ proves it   │
                  ├─────────┼───────────┼────────────┼─────────────┤
Indirect (GDX,UUP)│ Watch   │ Miners    │ USD weakens│ Carry trade │
                  │ miners  │ lag       │ on peace   │ unwind      │
                  ├─────────┼───────────┼────────────┼─────────────┤
Speculative (fert)│ Monitor │ Fertilizer│ Input cost │ Global      │
                  │ supply  │ stocks?   │ chain      │ rebalancing │
                   └─────────┴───────────┴────────────┴─────────────┘
```

At every (time, asset) intersection, DEPTH4 estimates:
- **Conviction**: How likely is this outcome? (0-100%)
- **Mispricing**: How much of this is already priced in? (0-100)
- **Priced-in %**: Specific to this cell — how much of this move has the market absorbed?

---

## Product Architecture

### Thesis = Edge in a Causal Graph

A DEPTH4 thesis is not a document. It is an **edge** in a graph connecting:
- A **CausalEvent** (what triggered it — "War de-escalation")
- A **CausalAsset** (what it targets — XAUUSD)
- With a **direction** (SHORT) and **confidence** (79%)

The thesis then declares **affects** — secondary assets it ripples into:
- GLD: ↑ 72% priced in (strong link)
- IAU: ↑ 34% priced in (moderate link — EDGE HERE)
- GDX: ↑ 45% priced in (moderate link)
- UUP: ↓ 12% priced in (weak link — UNPRICED OPPORTUNITY)

### Cluster = Shared Root Event

Theses that share the same root event form a **cluster**:

**War de-escalation cluster:**
- Gold SHORT (conviction 79%, mispricing 79) ← top thesis
- Defense LONG (conviction 78%, mispricing 61)
- Oil implied (no thesis yet — opportunity)
- ⚠ Conflict: Gold short and Defense long both active from same event

**Fed policy cluster:**
- Rates SHORT (conviction 78%, mispricing 69)
- Credit spreads implied (no thesis yet)

The cluster view shows: event → all thesis edges → implied effects → conflicts.

### Global Graph = The Market's Causal Map

All active events, all thesis edges, all implied effects form the **Global Causal Graph** at `/map`. This is the "god view" of the platform — showing the complete causal map of current macro forces and their market implications.

---

## Key Product Principles

### 1. No thesis is an island
Every thesis is connected. The gold thesis shares an event with the defense thesis. The oil thesis implies the fertilizer thesis. The rates thesis contradicts the gold thesis on USD direction. These connections are as important as the theses themselves.

### 2. The edge lives in the intersection
The moat is at the intersection of time depth and asset depth. A thesis is strongest not when it predicts a move at one level on one asset, but when it traces the full 4×4 matrix and finds the (time, asset) pair with the highest mispricing.

### 3. Show priced-in, not just prediction
Every cell shows "what the thesis expects" AND "how much is already priced in." A thesis with 80% conviction but 85% priced-in is a weak trade. A thesis with 65% conviction but 20% priced-in is a strong trade.

### 4. Conflicts are signals
When two theses from the same event predict opposite directions on the same asset, that's not a bug — it's a portfolio risk signal. The system should surface these conflicts, not hide them.

### 5. Implied effects are opportunities — engine-owned, not user homework
When an event propagates to an asset with high mispricing but no dedicated thesis, the pipeline should **auto-create** a thesis if significance thresholds are met. Otherwise implied moves live on **thesis detail** (collapsible "Implied moves") — never as feed prompts that ask the user to create a thesis.

---

## User Experience

### For the macro trader
- Sees thesis clusters grouped by root event — understands how their positions interconnect
- Sees which assets are most mispriced across the full causal chain
- Gets conflict warnings when their portfolio has contradictory bets
- Reviews AI-generated theses and stars or trades them — does not build the catalog from scratch

### For the serious retail trader
- Sees the full story chain from headline to fourth-order effect
- Understands WHY a thesis exists, not just WHAT to trade
- Can read the causal graph even without deep macro expertise
- Sees where the market is still behind, not just what happened

---

## Competitive Moat

DEPTH4's moat is not in predicting headlines (everyone does that). It is in:

1. **Time depth**: Following a story across 4 time horizons when competitors stop at the headline
2. **Asset depth**: Tracing causal chains across interconnected markets when competitors treat each asset in isolation
3. **The intersection**: Finding the specific (time, asset) pair with the highest mispricing in the full 4×4 matrix
4. **Dynamic conviction**: Updating as news flows in, not static predictions

No competitor systematically maps both time depth AND asset depth for macro theses. This is the core product differentiator.

---

## Current Status

### Built (live)
- Time-depth analysis (L1-L4 cascade)
- Thesis generation from news
- Conviction + mispricing scoring
- Resolution paths (Clean/Messy/Broken)
- Trade plans with entry/stop/target
- AI chat assistant
- Position tracking
- Feed as AI activity dashboard (thesis updates, new theses, status, key evidence)
- Help documentation

### In Development
- Asset-depth causal chain (per-thesis)
- Global causal map (/map page)
- Thesis clustering by event
- Cross-thesis conflict detection
- Auto-create theses from significant implied moves (pipeline thresholds)
- Implied moves on thesis detail (not feed discovery)

---

*The name DEPTH4 refers to the two dimensions of depth: time (4 levels) and assets (4 depths). The product's job is to find the single cell in the 4×4 matrix with the highest mispricing — and build a thesis around it.*

---

## Who it is for

DEPTH4 is for serious market participants who need fast, differentiated, decision-relevant thinking. They do not want generic analyst notes or headline rewrites; they want clear, causal theses with timing, conviction, and mispricing they can plug into a trade plan.

## Non-negotiables

- Every visible thesis must contain **cause, path, timing, and market implication**.
- Generic summaries or simple headline rewrites are failure.
- If quality is weak, the system should **reject the output** instead of publishing it.
- The product must feel like an **intelligence engine**, not a news dashboard or RSS reader.
- Claims must be checked against multiple independent sources before they matter for probabilities or conviction.

## Source hierarchy — strict ranking

Treat sources in this order. Never rely on, or prominently cite, a lower-tier source when a higher-tier source is available for the same fact.

1. **Tier 1 — Primary:** AFP wire, Reuters, AP, named government officials on record, CENTCOM statements, ISW Special Reports.
2. **Tier 2 — Verified regional:** Anadolu Agency, ABC Australia live updates, Al Jazeera confirmed reporting, GMA Network live updates, Times of India live.
3. **Tier 3 — Analytical:** Iran International, Jerusalem Post live blog, ISW daily updates, Chatham House.
4. **Tier 4 — Market intelligence:** Argus Media, ING Think, TradingEconomics, Polymarket, Robinhood prediction markets.
5. **Tier 5 — Use with caution:** RT, PressTV, Mehr News, TASS — always cross-reference with Tier 1–2 before acting, and flag the source explicitly when used.

RT and similar outlets are confirmed state media with editorial agendas. Any "verified fact" that originates from Tier 5 must have independent Tier 1–2 confirmation before it enters DEPTH4's reasoning or thesis matrix.

## Model usage

- Use the **best LLM (Opus)** for important analysis that needs high-quality, four-level reasoning, strict source handling, and user-visible theses.
- Use cheaper LLMs for low-risk, non-user-facing tasks such as clustering, tagging, or draft generation that will be heavily filtered before surfacing.

## Phrasing and language

- Use **simple retail trading language** that is easy to understand and feels conversational but serious.
- Explain moves, not jargon.
- A good pattern is the "least bad exit" example: clear headline, concrete bullet points, and explicit "why this works" / "why this is costly" sections.

For example, a DEPTH4-quality paragraph might look like:

> "Trump declares a 'Phase 1 victory': he claims to have destroyed Iran's offensive capacity, protected allies, and kept oil flowing under American protection. Project Freedom stays active as a permanent armed escort operation, rebranded as a 'freedom of navigation' mission rather than a declared war. Iran keeps nominal Hormuz sovereignty but loses the practical ability to weaponise tolls or closures. There is no humiliating peace treaty; the long-term problem is handed to the next administration."

This tone is specific, political, and concrete, not generic.

## Failure modes

DEPTH4 must actively avoid:

- Rewriting or paraphrasing headlines.
- Static thesis pages despite live inputs.
- Generic analyst-note tone.
- Vague scenario language without a clear, tradable implication.
- Over-confident probabilities that do not react as new information arrives.
- Any thesis that could have been produced by a generic "AI market news summary" tool.

## Release standard

A feature is not done unless it **strengthens the visible intelligence loop and preserves trust**. If a change makes the product feel more clever but less trustworthy or less differentiated, it should not ship.
