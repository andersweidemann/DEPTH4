## Generation Review

**Status: Total failure — zero trades across both candidates.**

Both candidates executed 0 trades over a 4.5-year IS window (2020-01-01 to 2024-06-30). This is not a signal-quality issue; it is an entry-logic or data-plumbing failure. No metrics are computable (PF, Sharpe, expectancy all NaN).

### Likely root causes
1. **Session/time filter misalignment** — London open logic may be using server time vs. broker time vs. UTC mismatch, so the breakout window never opens.
2. **Symbol naming / data feed** — GER40 and US500 may resolve to a symbol with no bars loaded (e.g., `GER40.cash` vs. `GER40`), causing the strategy to skip every bar.
3. **Entry condition too strict** — e.g., requiring range breakout AND a trend filter AND a volatility filter simultaneously, with no fallback.
4. **Lot sizing / margin guard** rejecting every order silently before execution.

### Recommendation
Do **not** iterate on parameters. Add diagnostic instrumentation (bar counter, signal counter, rejection reason counter) and re-run a smoke test before generating any new candidates. Neither strategy family should be abandoned yet — we have no evidence either way.