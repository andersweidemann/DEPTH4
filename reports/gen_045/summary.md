## Generation Verdict: TOTAL FAILURE

All 4 candidates produced **zero trades** across all symbol/timeframe combos in the 2020-01-01 to 2024-06-30 IS window. This is not a strategy logic problem — it is an **infrastructure / data / execution pipeline failure**. No metrics can be computed (PF/Sharpe/Sortino all NaN, trades=0, return=0).

### Root-cause hypotheses (in order of likelihood)
1. **Data feed not loaded / wrong symbol mapping**: Backtest engine likely failed to resolve `XAUUSD`, `GER40`, `US500` symbols to the data files. Check symbol aliases (e.g., `XAUUSDm`, `DE40`, `SPX500`, `US500.cash`).
2. **Session/time filters too restrictive**: Asia-London breakout, NY open volatility breakout, and session-gated mean reversion all have hard time windows. If broker server time vs. strategy time zones are misaligned (UTC vs. EET/EEST vs. exchange local), the session gate never opens.
3. **Indicator warmup exceeding data length**, or signal conditions requiring state (e.g., Donchian channel, BB width filter) never triggering because indicator buffers are empty.
4. **Entry condition logic bug**: likely an AND chain where one flag is never set true (e.g., `range_valid && session_open && atr_filter && !news_block` — one of them permanently false).

### Recommendation
**Do NOT iterate on strategy parameters.** Pivot the next step to a **diagnostic / smoke-test generation**:
- Produce a minimal sanity EA per symbol (e.g., buy-and-hold for 1 bar every 1000 bars) to confirm the harness fires trades at all.
- Log entry-condition counters per bar to identify which filter is killing signals.
- Verify symbol resolution and session-time conversion explicitly.

Once the pipeline is proven to generate trades, re-submit the same four strategy ideas unchanged — they are reasonable archetypes and should not be discarded on a zero-trade run.