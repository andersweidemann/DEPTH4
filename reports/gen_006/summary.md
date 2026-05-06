## Critic Report

**Status: Empty generation** — no candidate metrics were submitted for evaluation. Nothing to rank, nothing to promote.

### Observations
- Candidate list is empty (`[]`). Either the Optimizer produced no viable configurations, the backtest harness failed upstream, or results were not passed through to the Critic.
- Without metrics, fitness scoring, consistency analysis, and OOS/IS divergence checks cannot be performed.

### Recommended Actions (process, not parameters)
1. **Verify pipeline integrity**: confirm Generator → Optimizer → Backtester → Critic handoff. Check that metric JSON is being serialized and injected into the Critic prompt.
2. **Seed the next generation** with at least 3–5 diverse candidate families so the Critic has a comparative basis (single-candidate generations waste the ranking stage).
3. **Enforce minimum metric schema**: each candidate should ship with `pf`, `sharpe`, `max_dd_pct`, `trades`, `is_vs_oos_degradation_pct`, and per-symbol/TF breakdowns before reaching this stage.

### Strategy-family guidance for next generation
Since no evidence exists to kill any family, keep the search broad. Suggested diversified seeds:
- Trend-following on H4 (Donchian / Keltner breakout with ATR trailing).
- Mean-reversion on M15 (Bollinger fade with session filter, majors only).
- Session-open momentum (London/NY open breakout, time-boxed exits).

No dead branches can be declared from a null sample.