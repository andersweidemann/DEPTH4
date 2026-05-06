## Generation Verdict: FAIL

Both candidates fail acceptance thresholds. Recommend a strategy-family pivot rather than parameter tweaks.

### 00_xauusd_m5_asialondonrangebreakout
- **Zero trades across all 4 symbol/TF combos.** This indicates a broken signal pipeline: session time filters, range-definition thresholds, or breakout trigger never fire. Before pivoting, verify (a) session times match broker server time (likely off by DST/server offset), (b) range width filter isn't excluding all days, (c) breakout buffer (ATR mult) isn't unreachable intraday.
- If after fixes it still doesn't trigger ~1 trade/day, the family is dead for this data.

### 02_ger40_m15_donchiantrendbreakout
- PF average 0.95 (all combos <1.0 except GER40 M5 at 1.009). Best case is break-even noise.
- Sharpe negative on 3 of 4 combos. Win rate 40-44% with negative expectancy → loser average > winner average, classic breakout-in-chop failure.
- Max DD is small only because position sizing is tiny (return_pct ~0). Not a robustness signal.
- **Donchian trend breakout on M5/M15 in XAUUSD/GER40 is a known whipsaw regime.** The edge doesn't exist at these horizons without a trend/volatility regime filter.

### Acceptance check
- pf_min 2.0: both fail (NaN / 0.95)
- sharpe_min 1.5: both fail
- trades_min 200: cand 00 fails; cand 02 passes
- require_all_combos_positive: both fail

### Recommendation
Pivot strategy family. Breakout at M5/M15 without regime gating is saturated. Next generation should explore: (1) mean-reversion on XAUUSD M5 with volatility bands + session filter, (2) trend-continuation pullback (not breakout) on GER40 H1 with ADX>25 gate, (3) opening-range breakout only during high-ATR days (top quartile).