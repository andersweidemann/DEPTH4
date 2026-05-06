## Generation Review

**Status: CRITICAL FAILURE — zero trades across all 4 symbol/TF combos.**

The sole candidate `00_bb_bounce_xauusd_m15_simple` produced 0 trades on XAUUSD M5/M15 and GER40 M5/M15 over the full IS window (2020-01-01 to 2024-06-30). This is not a performance problem — it is an implementation or signal-gating problem. Possible causes:

1. **Entry condition never fires** — Bollinger bounce logic likely requires price to close back inside the bands after a breach; if coded as a strict single-bar reversal with extra confirming filters (RSI, trend, session), the intersection may be empty.
2. **Symbol/broker naming mismatch** — `XAUUSD` and `GER40` may not match the data feed (e.g., `XAUUSDm`, `GER40.cash`, `DE40`). If the backtester silently skipped missing symbols, trade count would be 0 with no error.
3. **Timeframe/data availability** — M5 history for 2020 may be truncated; verify bar counts loaded.
4. **Lot sizing / margin filter** — orders rejected pre-submission (zero-lot rounding, min stop distance violations on XAUUSD where stops are in points not pips).
5. **Strategy was designed for M15 XAUUSD only** — running it on GER40 and M5 without re-parameterising ATR/BB period is inappropriate regardless.

No fitness can be computed; all normalised inputs are NaN → fitness defaults to 0.

**Recommendation:** do NOT iterate on parameters. First prove the strategy can fire at all on its native combo (XAUUSD M15). Add instrumentation logging every bar's BB state, signal evaluation, and rejection reason.