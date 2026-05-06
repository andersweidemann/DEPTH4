## Generation Review: Empty Candidate Set

**Status:** No candidates submitted for evaluation.

The candidate metrics array is empty, meaning no EA variants have been backtested and submitted for ranking this cycle. No fitness scores can be computed, no survivors can be promoted, and no meaningful comparison against acceptance thresholds (PF>=2.0, DD<=15%, Sharpe>=1.5, trades>=200) is possible.

### Recommended Actions
1. **Verify pipeline integrity:** Check that the Generator produced candidates and the Backtester successfully ran them across the required symbol/TF combos. An empty set usually indicates an upstream failure (compile errors, data feed issues, or runner timeout) rather than a genuine zero-survivor generation.
2. **Re-run with logging:** Ensure per-candidate metric objects are emitted with fields pf, sharpe, max_dd_pct, trades, and IS/OOS splits so the Critic can compute normalized fitness.
3. **Seed next generation from archive:** If the Generator truly produced nothing, pull the last known surviving template from the hall-of-fame and mutate, rather than cold-starting.

No fitness ranking, no survivors, no dead branches can be declared from a null sample.