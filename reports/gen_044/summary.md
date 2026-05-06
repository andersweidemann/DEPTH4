## Critic Report

**Status: EMPTY GENERATION**

No candidate metrics were provided for evaluation. Cannot rank or assess fitness without backtest results.

### Required Inputs Missing
- Zero candidates submitted
- No PF, Sharpe, drawdown, or trade count data available
- Cannot evaluate against thresholds (PF≥2.0, DD≤15%, Sharpe≥1.5, trades≥200)

### Recommendation
Re-run the generation pipeline and ensure:
1. Synthesizer produces at least 3-5 candidate EAs per cycle
2. Backtester emits metrics objects for each (candidate, symbol, TF) combo
3. Both local and MT5 backtest results are attached for divergence checks
4. IS/OOS splits are reported separately to enable degradation analysis

No strategy-family pivot can be recommended without evidence of failure modes.