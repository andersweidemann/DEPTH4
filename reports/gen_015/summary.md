## Generation Review: EMPTY CANDIDATE SET

**Status:** No candidates submitted for evaluation.

**Observation:** The input `candidate metrics` array is empty `[]`. There is nothing to rank, score, or refine. Fitness cannot be computed without PF, Sharpe, drawdown, trade count, or consistency inputs.

**Action Required (upstream):**
1. Verify the Generator produced candidate EAs this cycle.
2. Verify the Backtester executed and emitted metrics JSON per (candidate, symbol, TF) combo.
3. Check the pipeline glue: metrics file path, serialization, and the handoff contract into the Critic stage.
4. If the Backtester ran but all candidates crashed/compiled-failed, surface those errors as candidates with `verdict: reject` and reason, rather than dropping them silently.

**No strategy-family pivot is recommended yet** — we have no evidence of failure, only evidence of a broken pipeline. Re-run the generation once inputs are wired correctly.