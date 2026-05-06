---
source_url: https://github.com/sbrakni/mean-reversion-mql5
commit: c021474bb25848982df80f32ee94d2b534ae8a52
license: none
license_verdict: inspiration_only
stars: 0
last_commit: '2026-02-16'
language: MQL5-EA
symbols_targeted:
- EURUSD
timeframes_targeted:
- M5
scout_verdict: promising
---

# Mean Reversion Scalper V3 (BB + RSI + BB-Width)

## Core idea
Classic mean reversion: when price closes outside Bollinger Bands with extreme short-period RSI, fade the move expecting reversion to the mean. Only trade when volatility (BB width) is above a percentile threshold, within active sessions.

## Entry rules
- BUY: Close < Lower BB(20,1.75) AND RSI(7) < 10.
- SELL: Close > Upper BB(20,1.75) AND RSI(7) > 90.
- Filters: BB width > 30th percentile, London-NY session 07:00-20:00, spread <= 3 pips, 3-bar cooldown, min R:R >= 1.0.

## Exit rules
- TP: opposite Bollinger Band (full mean reversion) — also modes for middle BB or fixed R:R.
- SL: 1.5x ATR(14) from entry.
- Time exit: close after 30 bars (~2.5h on M5) if neither SL/TP hit.

## Key parameters
- BB(20, 1.75)
- RSI period 7, thresholds 10/90
- ATR(14), SL 1.5x ATR
- BB width percentile filter 30%, lookback implicit
- Session 07:00-20:00, max spread 3 pips, cooldown 3 bars, time stop 30 bars

## Notable techniques worth stealing
- BB-width percentile volatility filter (avoid dead-range whipsaws).
- Time-stop as a third exit to cap losers that stall.
- Documented 4-session optimization pipeline: broad grid → focused → OOS → walk-forward 5-fold.
- Commission ($7/lot) and slippage (0.3 pip) modeled explicitly in synthetic-data calibration.

## Red flags
- Backtest uses synthetic data (GBM + GARCH + Student-t), not real EURUSD ticks — real-market performance unverified.
- 34% win rate with 1.5x ATR SL vs opposite-BB TP: edge depends heavily on BB-width regime; fragile if regime shifts.
- No license file.

## Suggested adaptation for XAUUSD / GER40 M5/M15
- Port to XAUUSD M5/M15: widen BB deviation to 2.0-2.2 and RSI thresholds to 15/85 given gold's fatter tails; require ATR-normalized distance from mid-BB in addition to 'outside BB'.
- GER40 M15: restrict to cash session (08:00-17:30 CET); increase cooldown to 5-10 bars.
- Keep BB-width percentile filter and time-stop; re-run walk-forward on real broker data rather than synthetic.
