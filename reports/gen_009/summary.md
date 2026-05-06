## Critic Report: Empty Generation

**Status:** No candidates were submitted for evaluation. The input candidate metrics array is empty, so no ranking, fitness calculation, or survivor selection can be performed.

**Recommendation:** The factory pipeline appears to have failed upstream. Likely causes:
1. Researcher produced no viable strategy specs for this cycle.
2. Builder/compiler failed to produce deployable EAs from specs.
3. Backtester failed to execute or returned no metrics (check MT5 connection, symbol availability, data range).
4. Metrics collator lost output between stages.

**Action Items:**
- Verify researcher output is non-empty and well-formed.
- Confirm builder successfully compiled at least one EA (.ex5 artifact).
- Check backtester logs for runtime errors, missing history, or zero-trade runs.
- Re-run the generation with at least 3-5 candidate strategies across differing families (trend, mean-reversion, breakout) to give the critic a meaningful population to rank.

No strategy families can be marked as dead branches because none were tested.