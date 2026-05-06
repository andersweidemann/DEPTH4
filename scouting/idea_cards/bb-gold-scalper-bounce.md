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

# BB Gold Scalper (Bollinger Bounce)

## Core idea
Mean-reversion bounce off Bollinger Bands on XAUUSD M15. Looks for a specific 3-bar pattern: price was inside the band, then pierced the band, then closed back inside (rejection/bounce), entering on the next bar.

## Entry rules
- LONG: bar[-2] close > lower BB; bar[-1] touched/broke lower BB; bar[0] closed back above lower BB.
- SHORT: mirror on upper BB.
- Max spread filter (30 pips); one trade at a time.

## Exit rules
- SL: 100 pips (fixed).
- TP: 500 pips (fixed, CRV 5:1).
- Optional: close at opposite BB touch.
- Optional trailing stop (100 pip trail, 50 pip step).

## Key parameters
- BB(20, 2.0, Close)
- FixedLotSize 0.01, MaxRiskDollar $10
- SL 100, TP 500 pips
- Timeframe M15, Symbol XAUUSD

## Notable techniques worth stealing
- Clean 3-bar BB-rejection pattern (more selective than naive touch entries).
- Optional symmetric exit at opposite BB (full mean-reversion target) alongside fixed R:R TP.
- Dollar-capped risk parameterization.

## Red flags
- Fixed pip SL/TP on gold ignores volatility regimes (should be ATR-scaled).
- CRV 5:1 with a mean-reversion premise tends to produce very low win rate; unverified edge.
- Zero stars, no backtest evidence, license ambiguous.

## Suggested adaptation for XAUUSD / GER40 M5/M15
- Port the 3-bar BB-rejection pattern but replace fixed SL/TP with ATR(14)-scaled distances (e.g. 1.5x ATR SL, 2-3x ATR TP or opposite-band target).
- Add BB width percentile filter so we only trade rejections when volatility is elevated.
- For GER40 M15 add session filter (DAX cash 08:00-17:30 CET).
