## Generation Review

**Status: Complete failure — zero trades across all 4 symbol/TF combos.**

The sole candidate `02_ger40_donchian_trend_adx_m15` produced 0 trades on XAUUSD M5/M15 and GER40 M5/M15 over the full IS window (2020-01-01 → 2024-06-30). This is not a performance issue but an **execution/signal-generation failure**. Either:

1. Entry conditions (Donchian breakout + ADX filter) are mutually exclusive with the data/session filter as wired, or
2. The ADX threshold is too high / Donchian lookback too long relative to M5–M15 bars available, or
3. Symbol mapping (GER40 vs DE40/GER40.cash) mismatch caused the bar feed to be empty, or
4. The strategy module wasn't correctly registered in the runner.

No fitness math is meaningful with `trades=0`; the candidate is auto-rejected.

**Recommendation:** Do NOT iterate parameters. First run a sanity harness — log bar counts, signal-eligible bars, and rejections by filter — before spending further compute. If GER40 is the target, confirm the feed symbol actually resolved.