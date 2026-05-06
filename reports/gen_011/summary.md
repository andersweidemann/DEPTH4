## Generation Review: Empty Candidate Set

**Status:** No candidates submitted for evaluation.

### Findings
- The candidate metrics array is empty (`[]`). There is nothing to rank, score, or critique.
- Fitness computation requires at minimum: pf, sharpe, max_dd, trades, and per-combo results for consistency scoring. None are available.

### Recommendation
Before the next Critic pass, the pipeline must supply at least one candidate object with the following schema per symbol/TF combo:
- `candidate_id`, `symbol`, `timeframe`, `is_metrics` (pf, sharpe, max_dd_pct, trades, win_rate, expectancy), `oos_metrics` (same fields), `mt5_vs_local_divergence_pct`, and trade-level stats (MAE/MFE distributions) to enable concrete parameter critique.

### Process Gate
Treat this as a no-op generation. Do not advance any strategy to survivor status. Re-run the backtest stage and resubmit.