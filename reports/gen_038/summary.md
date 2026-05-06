## Generation Verdict: TOTAL FAILURE

All candidates across all symbol/timeframe combos produced **zero trades** during the IS window (2020-01-01 to 2024-06-30). This is not a performance issue — it is a signal generation / execution pipeline failure.

### Likely root causes (investigate before any parameter tuning)
1. **Data feed not loaded**: backtester may not be receiving bars for XAUUSD/GER40 at M5/M15 (symbol naming mismatch: `XAUUSD` vs `XAU/USD`, `GER40` vs `DE40`/`GER40.cash`).
2. **Indicator warm-up never satisfied**: Donchian length or BB lookback may exceed available history per session, so `ready` flag never flips true.
3. **Entry gating too strict**: compound filters (e.g., ATR regime + session window + ADX threshold) AND'd together to an empty set.
4. **Order sizing / margin check failing silently**: lots computed as 0 due to risk% on zero equity or missing contract spec.
5. **Signal comparison bug**: e.g., using `>=` on floats with identical values, or comparing current bar to itself.

### Recommendation
**Do NOT iterate on parameters.** Pivot to pipeline debugging first. Add instrumentation: bar count received, indicator-ready bar, signal-true count, order-attempt count, order-reject reason. Only after a candidate produces >0 trades should fitness ranking resume.

If pipeline is confirmed healthy and these strategies still produce nothing, both families (Donchian breakout, BB squeeze expansion) should be deprioritized on M5/M15 for XAUUSD/GER40 — but that conclusion is premature given zero-trade output.