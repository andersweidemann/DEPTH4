## Generation Review

**Status: EMPTY GENERATION**

No candidate metrics were provided in the input array. No ranking, fitness scoring, or verdict assignment is possible without backtest results.

### Required Inputs Missing
- Per-candidate metrics (PF, Sharpe, max DD, trade count) across symbols/timeframes
- IS vs OOS split results for degradation analysis
- Local vs MT5 divergence measurements
- Per-combo (symbol × TF) breakdown for consistency scoring

### Recommended Next Steps
1. Verify the candidate pipeline is emitting metrics to the Critic stage (check serialization/IO between Backtester and Critic).
2. Confirm at least one strategy family has been generated and compiled successfully.
3. Re-run with a non-empty candidate set before requesting ranking.

No strategy-family pivot can be recommended at this stage because no families have been evaluated. Do not treat this as a 'bad generation' — treat it as a pipeline/plumbing issue upstream of the Critic.