## Critic Report: Empty Generation

**Status:** No candidates submitted for evaluation.

### Observations
- The candidate metrics array is empty; there is nothing to rank, score, or compare against the acceptance thresholds.
- Fitness calculation is not applicable without at least one candidate providing PF, Sharpe, max DD, trade count, and consistency inputs.

### Recommendation
- **Pipeline check:** Verify that the Generator and Backtester stages are producing and forwarding candidate result objects. An empty input here typically indicates an upstream failure (e.g., compile errors, zero-trade runs filtered out, or missing metric aggregation).
- **Next action:** Re-run the generation stage with at least one baseline candidate (e.g., a known-reference breakout or MA-cross EA) to validate the end-to-end metric flow before iterating on novel strategies.
- **No family pivot is warranted yet** because no strategy family has actually been tested in this cycle.