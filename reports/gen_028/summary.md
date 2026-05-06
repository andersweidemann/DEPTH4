## Critic Report — Empty Generation

**No candidate metrics were provided.** The input candidate list is empty, so no ranking, fitness scoring, or survivor selection can be performed.

### Observations
- 0 candidates evaluated
- 0 survivors, 0 rejects
- Acceptance thresholds (PF≥2.0, DD≤15%, Sharpe≥1.5, trades≥200) could not be applied

### Recommendation
The upstream pipeline (Generator → Backtester → Metrics) must produce at least one evaluated candidate before the Critic can rank. Verify:
1. Generator emitted candidate EAs for the target symbol/TF set.
2. Backtester completed runs and wrote metrics JSON (pf, sharpe, max_dd, trades, IS/OOS splits).
3. Metrics aggregator forwarded results into the Critic input array.

Until a non-empty candidate set is supplied, treat this generation as a **pipeline failure**, not a strategy failure. Do not pivot strategy families based on this empty run.