## Generation 0 Review

**Verdict: Total failure. Pivot required.**

- **00_xau_bb_rsi_meanrev_m15**: 0 trades executed. Entry filters are too restrictive or signal logic is broken. No data to evaluate.
- **01_ger40_donchian_breakout_m15**: Executed 1,389 trades (healthy sample), but PF=1.00, Sharpe=-0.12, negative return. Classic donchian-breakout-on-index failure: low win rate (33.8%) is acceptable for breakout, but expectancy is effectively zero and edge does not cover costs/spread. DD 10% with no compensating return.
- **02_xau_london_range_expansion_m5**: 0 trades. Session/range filter likely mis-specified or timezone mismatch.

**No candidates meet acceptance thresholds** (pf>=2.0, sharpe>=1.5, trades>=200). Two of three produced zero trades — strongly suggests systemic bug in signal gating, symbol specs, or session logic rather than parameter issues.

**Recommended pivot**: Before spawning new candidates, audit the harness (broker symbol names XAUUSD vs XAU/USD, session timezone handling, ATR/BB warmup bars). Then pivot away from naive donchian breakout on DAX; consider volatility-regime-filtered breakouts or pullback-to-breakout variants.