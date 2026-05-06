## Generation Review

Both candidates fail acceptance thresholds decisively. This is a **full generation failure** and warrants a strategy-family review rather than parameter tweaks on these specific ideas.

- **00_bb_rsi_mean_reversion_xau_m15**: PF 0.92 (<2.0), Sharpe -0.45 (<1.5), return -11.4%, win rate 41.3%, DD 15.3% (>15.0). Trade count is healthy (1067) so the signal is simply unprofitable — classic mean-reversion bleed on XAU which is a strongly trending/impulsive instrument on M15. Expectancy is negative (-0.011), meaning no edge exists to optimize around.
- **01_asia_london_range_breakout_xau_m5**: Zero trades. Entry filter is too restrictive or the session/range definition never triggers. Unfit to evaluate — treat as an implementation/config defect, not a strategy validation.

**Recommendation**: Pivot mean-reversion away from XAU M15. Debug the range-breakout entry logic before drawing conclusions on the family.