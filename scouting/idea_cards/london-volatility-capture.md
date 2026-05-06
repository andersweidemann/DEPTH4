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

# London Volatility Capture

## Core idea
Systematic MT5 Expert Advisor implementing an Asia range → London breakout strategy on XAUUSD.

## Entry rules
- **True breakout** → continuation
- **Breakout + retest** → continuation after confirmation
- **Breakout + reversal** → liquidity grab then move opposite

## Exit rules
- **Stop Loss**: At 100 Pips loss
- **Take Profit**: At 500 Pips profit
- **BB-Touch** (Optional): Position closes when price touches opposite BB

## Key parameters
- **ATR Period**: 14
- **Min Range ATR**: 0.50
- **Max Range ATR**: 2.00

## Notable techniques worth stealing
- Asia range identification
- London breakout strategy
- ATR-based volatility filtering

## Red flags
- Limited backtesting results provided
- Unclear license terms

## Suggested adaptation for XAUUSD / GER40 M5/M15
- Test the strategy on GER40
- Experiment with different timeframes (M5, M15)
