## Generation Verdict: FULL REJECT (zero-trade generation)

Both candidates produced **0 trades** across all symbol/TF combos in the IS window (2020-01-01 to 2024-06-30). This is not a strategy-quality issue — it is an **execution/data/signal-gating failure**. No metrics are computable (PF/Sharpe/Sortino all NaN, returns and DD flat at 0).

### Likely root causes (investigate before any parameter work)
1. **Data feed not loaded / symbol mapping mismatch**: XAUUSD/GER40/US500 tickers may not match broker symbol aliases (e.g., `XAUUSD` vs `GOLD`, `GER40` vs `DE40`/`DAX40`, `US500` vs `SPX500`). Verify the data adapter resolved bars > 0.
2. **Session filter kills all bars**: The Asia/London range candidate almost certainly has a session window bug (TZ offset, DST, or broker server-time vs UTC). A session filter that never evaluates true = 0 trades.
3. **Donchian lookback > available warmup**: If lookback (e.g., 55) is computed before sufficient bars accumulate per symbol, the breakout condition never fires. Also check if breakout requires `close > prior_high` strictly and the comparison is on the wrong bar index (look-ahead guard too aggressive).
4. **Order sizing / risk guard returning 0 lots**: If min-lot rounding or risk % against balance resolves to 0, orders are silently skipped.
5. **Spread/volatility filter too tight**: ATR or spread filter rejecting 100% of setups.

### Recommendation
Do **not** iterate parameters. Add instrumentation first: log (a) bars loaded per symbol, (b) signal-condition evaluations per day, (c) reasons for signal rejection (session, spread, risk, warmup). Re-run a sanity backtest with filters disabled to confirm the strategy core fires at all.

No strategy-family pivot recommended yet — we have no evidence either family is bad, only that the harness produced nothing.