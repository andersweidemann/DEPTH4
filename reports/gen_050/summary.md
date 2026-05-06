## Generation Verdict: FAIL — Zero Trades Across All Combos

The sole candidate (`01_cand_1`) produced **0 trades** across all four symbol/TF combos (XAUUSD M5/M15, GER40 M5/M15) over a 4.5-year IS window (2020-01-01 to 2024-06-30). All performance metrics are NaN/zero, indicating the strategy's entry logic never triggered — not a performance problem but a **signal-generation failure**.

### Likely Root Causes
1. **Entry conditions too restrictive** — compound filters (e.g. multi-indicator confluence with tight thresholds) producing empty intersection.
2. **Session/time filters** misaligned with symbol trading hours (e.g. FX session filter applied to GER40 index).
3. **Indicator warm-up / lookback bug** — signal arrays never populated, or shifted indexing always returning neutral.
4. **Symbol point/digit mismatch** — thresholds expressed in pips/points evaluated against raw price, never crossed.
5. **Broken data feed mapping** or wrong column (bid vs. mid) inside the backtest adapter.

### Recommendation
Do not tune parameters. Ship a **diagnostic pass** first: log signal counts, filter-stage attrition, and a single-combo sanity trace. If the family genuinely has no edge at reasonable permissiveness, **pivot the strategy family** rather than loosening thresholds until noise trades appear.