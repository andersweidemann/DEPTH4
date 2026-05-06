---
source_url: https://github.com/youngboiiii/BB-Gold-Scalper-EA
commit: 2886f4bb20344ebaa9367cd6edc35ec1924e0f2e
license: NOASSERTION (README claims MIT)
license_verdict: inspiration_only
stars: 0
last_commit: '2026-01-21'
language: MQL5-EA
symbols_targeted:
- XAUUSD
timeframes_targeted:
- M15
scout_verdict: interesting
---

# BB Gold Scalper EA

## Core idea
Bollinger Band touch-and-bounce reversal on XAUUSD M15. Looks for a 3-bar pattern where price pokes through a BB and closes back inside, confirming a mean-reversion entry.

## Entry rules
- LONG: bar[-2] closed above lower BB; bar[-1] touched/broke lower BB; bar[0] closed back above lower BB -> buy next bar.
- SHORT: mirror on upper BB.
- BB(20, 2.0, close).

## Exit rules
- Fixed SL: 100 pips (~$10 at 0.01 lots).
- Fixed TP: 500 pips (5:1 R:R).
- Optional early exit when price touches opposite BB.
- Optional trailing stop (100/50 pips).
- Max spread filter 30 pips; one trade at a time.

## Key parameters
BB_Period=20, BB_Deviation=2.0, StopLossPips=100, TakeProfitPips=500, TrailingStopPips=100, TrailingStepPips=50, MaxSpreadPips=30, Timeframe=M15.

## Notable techniques worth stealing
- Clean 3-bar BB rejection confirmation pattern (avoids trading while price is still outside the band).
- Dual exit framework: fixed R:R plus optional opposite-BB mean-reversion exit — handy for A/B testing exit logic.
- Preset config blocks (Standard / Conservative) packaged as a separate file.

## Red flags
- Zero stars, single author, no backtest metrics shown.
- 5:1 R:R on a mean-reversion setup is ambitious; likely low win rate and sensitive to regime.
- "Pips" on XAUUSD is broker-dependent — need careful point/pip handling.
- License header says MIT but repo metadata is NOASSERTION -> treat as inspiration only.

## Suggested adaptation for XAUUSD / GER40 M5/M15
- Port the 3-bar BB rejection as a signal module in our framework; parameterize BB period/deviation.
- Replace pip-fixed SL/TP with ATR-based SL (e.g. 1.0–1.5x ATR14) and test multiple R:R targets (1.5, 2, 3).
- Add session filter (London/NY) since gold is noisy in Asia.
- Try the same pattern on GER40 M15 with wider BB deviation (2.2–2.5) to reduce false touches in the index's trending phases.
