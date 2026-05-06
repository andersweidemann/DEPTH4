## Generation Review

**Status: FAILED — zero trades across all candidates.**

The sole candidate `01_xauusd_m15_bbrsimeanreversion_v1` produced **0 trades** over the 4.5-year IS window (2020-01-01 to 2024-06-30) on XAUUSD M15. All metrics are NaN/zero, indicating the entry logic never triggered.

### Root cause hypotheses
1. **Entry conditions too restrictive** — Typical BB+RSI mean-reversion on XAUUSD M15 should fire 500–2000 times over 4.5y. Zero trades implies a logic bug or impossibly tight filter (e.g., RSI<20 AND price<lower BB AND additional trend filter AND session filter all ANDed).
2. **Indicator handle / buffer error** — MQL5 `CopyBuffer` failures silently skip ticks; OnTick may be returning early.
3. **Symbol/contract-size/stops-level rejection** — Orders failing broker validation (min stop distance on XAUUSD is often 30–50 points) and being aborted before `OrderSend`.
4. **Timeframe/bar-gate logic** — `IsNewBar()` gate may be broken, or the EA is checking conditions only on tick 0.

### Recommendation
Do **not** iterate parameters — the EA is non-functional. Fix the code path first, then re-run a sanity backtest. If after plumbing fixes the BB+RSI family still under-trades on XAUUSD M15, pivot away from this family on this instrument.