---
source_url: https://github.com/sbrakni/mean-reversion-mql5
commit: c021474bb25848982df80f32ee94d2b534ae8a52
license: ''
license_verdict: inspiration_only
stars: 0
last_commit: '2026-02-16'
language: MQL5
symbols_targeted:
- EURUSD
timeframes_targeted:
- M5
scout_verdict: niche
---

# Mean Reversion Scalper

## Core idea
Mean reversion scalping Expert Advisor for MetaTrader 5, optimized via multi-session backtesting over 3 years on EURUSD M5.

## Entry rules
- **BUY:** Close < Lower BB AND RSI(7) < 10 (oversold)
- **SELL:** Close > Upper BB AND RSI(7) > 90 (overbought)

## Exit rules
- **Take Profit:** Opposite Bollinger Band (full mean reversion)
- **Stop Loss:** 1.5x ATR from entry
- **Time Exit:** Close after 30 bars (~2.5 hours) if neither SL/TP hit

## Key parameters
- **BB Period**: 20
- **BB Deviation**: 1.75
- **RSI Period**: 7

## Notable techniques worth stealing
- Mean reversion strategy
- Bollinger Band identification
- RSI-based momentum filtering

## Red flags
- Limited backtesting results provided
- Unclear license terms

## Suggested adaptation for XAUUSD / GER40 M5/M15
- Test the strategy on XAUUSD and GER40
- Experiment with different timeframes (M5, M15)
