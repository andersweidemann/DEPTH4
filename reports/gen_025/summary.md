## Generation Verdict: TOTAL FAILURE

All three candidates produced **zero trades** across all four symbol/timeframe combos (XAUUSD M5/M15, GER40 M5/M15). This is not a strategy-quality problem — it is a **pipeline / entry-gate problem**. No metrics are computable (all NaN), so fitness ranking is meaningless.

### Likely root causes (in priority order)
1. **Data loading / symbol mapping failure** — backtester may not be finding bars for the configured symbols (e.g., `XAUUSD` vs `XAU/USD`, `GER40` vs `DE40`/`GER40.cash`). Zero trades on every combo including the strategy's *native* symbol is the tell.
2. **Session / time filter too restrictive** — Asia-London range breakout in particular depends on correct broker server time; a TZ offset bug would kill all entries.
3. **Entry conditions logically unreachable** — e.g., requiring `close > upper_band AND rsi > 70 AND trend_up` simultaneously with wrong operator, or indicator warmup consuming the entire series.
4. **Candidates run on wrong symbols** — `03_us500_m5_emapullbacktrend` was tested on XAUUSD/GER40, not US500. Likely produces no signals by design if it hard-filters on symbol name.

### Recommendation
Do **not** iterate on strategy parameters. Halt generation and fix the harness: (a) verify data frames have >0 bars per combo, (b) log signal counts pre-filter, pre-risk, pre-order, (c) ensure each candidate is run on its intended symbol at minimum.