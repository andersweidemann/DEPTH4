## Generation Review

**Both candidates fail acceptance.** No survivors.

### 00_xauusd_asia_range_london_breakout_m5
- **Zero trades across all 4 symbol/TF combos.** This indicates a signal-gating bug, wrong session windows (likely UTC vs broker time mismatch), or an impossible entry condition (e.g., breakout threshold measured in points vs price). No metrics to evaluate.

### 02_ger40_donchian_trend_breakout_m15
- Ran on intended asset (GER40 M15) with only **7 trades** over 4.5 years — catastrophically under-traded, PF=0.0 (zero wins), expectancy -1.53R. Donchian lookback likely far too long or ATR filter too strict.
- On GER40 M5: 18 trades, PF 0.67, still under threshold.
- The candidate "works" numerically only on XAUUSD where it was not designed to run (1867 and 1030 trades) but is still unprofitable (PF 0.87 and 0.998). This is noise, not signal.
- Fails all acceptance gates: PF<2, Sharpe<1.5, trades<200 on target combo, and not all combos positive.

### Recommendation
Pivot the generation. The London-breakout idea never fired (infrastructure issue — fix first, do not re-theme). The Donchian-trend-breakout on GER40 M15 is a **dead branch**: index intraday donchian breakouts have been mean-reverting in the 2020-2024 regime. Pivot to **intraday mean-reversion / opening-range fade** on GER40, and for XAUUSD explore **session-volatility expansion with ATR-scaled stops** rather than pure breakout.