## Generation Verdict: FAILED

The sole candidate `02_03_donchian_trend_breakout_ger40_m15` produced **zero trades across all four symbol/timeframe combos** (XAUUSD M5/M15, GER40 M5/M15) over the IS window 2020-01-01 to 2024-06-30. This is not a parameter-tuning problem — it is a signal-generation failure. Every metric is NaN or zero, so fitness collapses to 0.0 and acceptance thresholds (trades_min=200, pf_min=2.0, sharpe_min=1.5) cannot be evaluated.

### Root-cause hypotheses
1. **Donchian channel length too long for M15** (e.g., 55–100 bars on an intraday TF rarely breaks cleanly once session filters, spreads, and ATR gates are layered on).
2. **Breakout confirmation filter too strict** — trend filter (e.g., HTF EMA alignment or ADX>25) combined with close-beyond-channel likely eliminates every bar.
3. **Session/time filter** may be excluding all valid hours, or symbol aliasing (GER40 vs DE40/DAX) is silently returning empty data.
4. **Stop/entry distance gate** (min ATR or spread multiple) rejecting all setups.

### Recommendation
Before pivoting the family, run a **diagnostic pass** with ALL filters disabled (pure Donchian breakout, length=20, no trend/session/ATR gate) to confirm data is flowing and signals exist. If that still yields 0 trades → data/symbol wiring bug. If it yields trades → re-enable filters one at a time to find the killer.

If diagnostic still produces zero trades on both instruments, treat Donchian trend-breakout on M5/M15 indices+gold as a **dead branch** for this factory config and pivot to a mean-reversion or session-open range family.