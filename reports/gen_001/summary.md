## Generation Review

**Status: EMPTY GENERATION**

No candidate metrics were provided for evaluation. Zero candidates received means either:
1. The Researcher/Coder pipeline produced no compilable artifacts
2. Backtest execution failed upstream before metrics could be emitted
3. Input wiring between the Tester and Critic is broken

**Recommendation:** Do not proceed to mutation/refinement. Halt the factory loop and diagnose the upstream stage. A Critic cannot rank an empty set, and generating synthetic verdicts would poison the evolutionary memory.

**Next actions for the orchestrator:**
- Verify the Tester stage emitted at least one metrics object per (candidate, symbol, TF) tuple.
- Confirm the JSON payload schema matches Critic inputs (candidate id, pf, sharpe, max_dd_pct, trades, is/oos split, local_vs_mt5 divergence).
- If the Coder stage failed to produce valid MQL5, escalate to the Researcher for a new strategy family rather than retrying the same spec.

No dead branches can be declared from zero evidence.