---
source_url: https://github.com/youngboiiii/BB-Gold-Scalper-EA
commit: 2886f4bb20344ebaa9367cd6edc35ec1924e0f2e
license: MIT
license_verdict: port_allowed
stars: 0
last_commit: '2026-01-21'
language: MQL5-EA
symbols_targeted:
- XAUUSD
timeframes_targeted:
- M15
scout_verdict: promising
---

# BB Gold Scalper

## Core idea
Bollinger Band Scalping Expert Advisor for XAUUSD (Gold) - MT5 | CRV 5:1 | M15 Timeframe | Professional Risk Management

## Entry rules
**LONG (Buy) Signal:**
1. 2 bars ago: Closed ABOVE lower BB
2. Previous bar: Touched/broke through lower BB
3. Current bar: Closed back ABOVE lower BB (Bounce)
→ LONG Entry on next bar

**SHORT (Sell) Signal:**
1. 2 bars ago: Closed BELOW upper BB
2. Previous bar: Touched/broke through upper BB
3. Current bar: Closed back BELOW upper BB (Bounce)
→ SHORT Entry on next bar

## Exit rules
**3 Exit Options:**
1. **Stop Loss**: At 100 Pips loss ($10)
2. **Take Profit**: At 500 Pips profit ($50) - CRV 5:1
3. **BB-Touch** (Optional): Position closes when price touches opposite BB

## Key parameters
- **Timeframe**: M15 (15-minute chart)
- **Symbol**: XAUUSD (Gold/USD)
- **Max Risk**: $10 per trade
- **CRV**: 5:1 (Risk-to-Reward Ratio)
- **Stop Loss**: 100 Pips (≈ $10 at 0.01 Lots)
- **Take Profit**: 500 Pips (≈ $50 at 0.01 Lots)

## Notable techniques worth stealing
- Bollinger Band Touch strategy
- Fixed risk management
- Trailing stop loss

## Red flags
- Limited backtesting results provided

## Suggested adaptation for XAUUSD / GER40 M5/M15
- Test the strategy on GER40
- Experiment with different timeframes (M5, M15)
