## Generation Verdict: TOTAL FAILURE

All three candidates produced **zero trades** across all 4 symbol/TF combos (XAUUSD M5/M15, GER40 M5/M15) over the full 2020-01-01 to 2024-06-30 IS window. This is not a parameter-tuning problem — it is a structural failure in the strategy family or the execution pipeline.

### Root-cause hypotheses (in priority order)
1. **Entry conditions never fire.** Signal logic likely uses conjunctive filters (e.g., trend + momentum + session + volatility regime) whose joint probability over ~4.5 years of M5 data is effectively zero. With XAUUSD M5 alone offering ~300k bars, zero trades implies a logic bug or impossible threshold.
2. **Data/symbol mapping issue.** Broker-specific symbol names (XAUUSD vs XAUUSD.sml, GER40 vs DE40) may not resolve, causing the strategy to see empty series. Verify bar counts loaded per combo before signal evaluation.
3. **Indicator warmup / lookahead guard** rejecting every bar (e.g., ATR period > available history, or a `if bars < N: return` that is never false because N is misconfigured).
4. **Order sizing / risk filter** vetoing every would-be trade (min lot, margin check, spread filter set tighter than instrument's typical spread — e.g., max_spread=5 points on XAUUSD which normally runs 20–40).

### Recommendation: PIVOT, do not tweak
Do not refine parameters on these candidates. Instead:
- Add an instrumentation pass: log (bars_loaded, signals_generated, signals_filtered, orders_attempted, orders_rejected_reason) per combo. Without this telemetry we are blind.
- Regenerate a new family using a *known-firing* baseline (e.g., simple Donchian breakout or EMA cross with no regime filter) as a sanity anchor. If the baseline also produces zero trades, the bug is in the harness, not the strategy.
- Abandon multi-filter confluence designs until single-filter variants are shown to trade.