## Generation Review

Both candidates fail acceptance thresholds by a wide margin. No survivors.

- **00_bb_rsi_meanrev_xau_m15_v1**: 1503 trades but PF 0.94 (below 2.0), Sharpe -0.36 (below 1.5), negative return -7.83%, expectancy -0.005. Win rate 53.4% is decent but average loss exceeds average win — classic mean-reversion-in-trend failure on XAU. Max DD 15.9% slightly over 15% cap.
- **02_asia_london_range_break_xau_m5_v1**: Zero trades generated over 4.5 years. Entry logic is either gated too tightly (session filter + breakout threshold) or never triggers. Completely broken, not just underperforming.

**Recommendation**: Pivot strategy family. XAU M15 mean-reversion with BB+RSI is well-known to bleed during gold's trending regimes (2020 COVID rally, 2022-2024 uptrend). The session range breakout candidate is non-functional and needs a full re-spec, not tweaks. Consider instead: (a) trend-following on XAU H1/H4 with ATR trail, (b) volatility-breakout with regime filter (ADX > 25), (c) test mean-reversion on range-bound majors (EURCHF, AUDNZD) rather than XAU.