---
source_url: https://github.com/yannis-montreer/MT5-EA-London-Volatility-Capture-LVC-EA
commit: 2868957900aa9a06e8d9eb6523f938947210f6e9
license: ''
license_verdict: inspiration_only
stars: 0
last_commit: '2026-03-29'
language: MQL5
symbols_targeted:
- XAUUSD
timeframes_targeted:
- M5
scout_verdict: interesting
---

# Asia-London Range Expansion EA

## Core idea
The EA identifies the Asia range and then trades the expansion phase using strictly defined, quantitative rules.

## Entry rules
* Breakouts must occur early in the London session
* Retests must happen within a limited number of candles
* Reversals must be fast (strong displacement)

## Exit rules
* Stop Loss: At 100 Pips loss
* Take Profit: At 500 Pips profit
* BB-Touch (Optional): Position closes when price touches opposite BB

## Key parameters
* Timeframe: M5
* Symbol: XAUUSD
* ATR Period: 14
* Min Range ATR: 0.50
* Max Range ATR: 2.00

## Notable techniques worth stealing
* Asia-London range expansion strategy
* ATR-based volatility filters
* Time-based logic

## Red flags
* Limited backtesting results provided
* No clear risk management strategy

## Suggested adaptation for XAUUSD / GER40 M5/M15
* Test the EA on different timeframes (M5, M15) and symbols (XAUUSD, GER40)
