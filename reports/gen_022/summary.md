## Generation Verdict: TOTAL FAILURE

Both candidates produced **zero trades** across all 4 symbol/TF combos (XAUUSD M5/M15, GER40 M5/M15) over the full 2020-01-01 to 2024-06-30 IS window. All metrics are NaN or 0.0. This is not a fitness problem — it is a signal-generation or execution-path problem.

### Likely root causes (in priority order)
1. **Entry conditions never trigger**: thresholds (e.g., z-score, RSI bands, breakout multipliers) are too restrictive or reference undefined/NaN indicator values during warmup.
2. **Data feed / symbol mapping mismatch**: symbols `XAUUSD` and `GER40` may not match broker/backtest symbol strings (e.g., `XAUUSDm`, `DE40`, `GER40.cash`). Verify symbol resolution in the runner.
3. **Session / time filter wipes out all bars**: a session gate (e.g., London-only, no-Friday, news blackout) may be evaluating to False universally.
4. **Risk sizing returns 0 lots**: if min-lot rounding or free-margin check fails, orders are silently skipped.
5. **Signal logic bug**: e.g., comparing incompatible series, wrong shift, or `and` vs `&` on vectorized conditions.

### Recommendation: PIVOT — do not tune parameters
Running a fitness comparison on two zero-trade candidates is meaningless. Before generating candidates 3+, the factory must first prove the scaffold can produce *any* trades on a known-trivial strategy (e.g., MA(20)/MA(50) crossover, no filters) on each symbol/TF. Only after a smoke-test baseline produces trades should new candidate families be proposed.