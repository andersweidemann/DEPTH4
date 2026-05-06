## Generation Review

**Status: Total failure — zero trades across all candidates and combos.**

Both candidates (`01_xau_m15_bb_bounce_3bar`, `03_us500_m15_trend_pullback_ema`) produced 0 trades on XAUUSD M5/M15 and GER40 M5/M15 across the IS window 2020-01-01 → 2024-06-30. This is not a parameter-tuning problem; it is an entry-gate or data-plumbing problem. No meaningful PF, Sharpe, DD, or expectancy can be computed. All metrics are NaN/0.

### Likely root causes (investigate before another generation)
1. **Data feed / symbol mapping mismatch** — candidate `01` is named for XAU M15 and `03` for US500 M15, yet both were tested on XAUUSD and GER40. US500 bars may not even be loaded for candidate 03, explaining zero trades. Verify symbol registry and timeframe shifts are actually being passed to the signal engine.
2. **Entry conditions too conjunctive** — 3-bar BB bounce confirmation and EMA pullback filters likely gate on simultaneous conditions (BB touch + 3 consecutive confirmation bars + trend filter) that almost never align on 5/15m. A sanity `--dry-run --log-signals` pass should be run to count *candidate* signals before risk filters.
3. **Session / spread / ATR filters** — if session filter is set to a window that does not overlap with the data timezone, or ATR floor is above realized ATR, the strategy will never arm.
4. **Warmup / indicator lookback** — BB(20) + 3-bar confirmation + EMA(e.g. 200) on M5 needs ~200 bars warmup; if the backtester is silently skipping due to NaN indicators, check the warmup handling.

### Recommendation
Do **not** iterate parameters on these two ideas until a diagnostic run proves the signal generator fires at all. If after instrumentation the signals still do not trigger on the intended symbol/TF, pivot the family.