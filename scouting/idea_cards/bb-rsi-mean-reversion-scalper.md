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
Mean reversion entry when price closes outside Bollinger Bands with an extreme RSI(7) reading, exit at the opposite band. Only trades when BB width is above the 30th percentile (avoids dead-range chop) and during active sessions.

## Entry rules
- BUY: Close < Lower BB(20, 1.75) AND RSI(7) < 10
- SELL: Close > Upper BB(20, 1.75) AND RSI(7) > 90
- BB width > 30th percentile of recent history
- Session 07:00-20:00
- Max spread 3 pips, cooldown 3 bars, min R:R 1.0

## Exit rules
- TP: opposite Bollinger Band (full mean reversion) - or middle BB / fixed RR modes available.
- SL: 1.5x ATR(14) from entry.
- Time stop: close after 30 bars (~2.5h on M5) if neither hit.

## Key parameters
- BB(20, 1.75), RSI(7), ATR(14)
- BB width percentile filter: 30
- Cooldown 3 bars; Max spread 3 pips
- Time exit: 30 bars

## Notable techniques worth stealing
- BB-width percentile regime filter (only trade when volatility above threshold) - elegant and adaptive.
- Time stop as third exit prevents stale trades.
- Structured multi-session optimization log (broad grid -> focused -> OOS -> walk-forward 5-fold) is the right methodology.
- Calibrated synthetic data (GBM+GARCH+Student-t) for robust OOS testing.

## Red flags
- Results from synthetic data, not real broker ticks; live slippage/spread on gold/DAX will hurt more than 0.3 pip slippage assumed.
- Tuned on EURUSD M5; thresholds will not transfer directly.
- RSI(7)<10 is very rare; trade count may be low on XAUUSD/GER40.
- 34% win-rate with 1.5x ATR stop and 1:1 min RR means tail risk on losing streaks.

## Suggested adaptation for XAUUSD / GER40 M5/M15
- Relax RSI thresholds to 15/85 for gold/DAX which are more volatile and rarely hit 10/90.
- Increase BB deviation to 2.0-2.2 on XAUUSD M5 to offset fat tails.
- Keep the BB-width percentile filter - critical for avoiding mean-reversion fails during breakouts common on GER40.
- Tighten session to London-only (07:00-12:00 UTC) on GER40 to avoid illiquid US-close reversals.
- Preserve the 4-session optimization + walk-forward methodology when refitting.
