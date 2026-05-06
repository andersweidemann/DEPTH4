---
source_url: https://github.com/yannis-montreer/MT5-EA-London-Volatility-Capture-LVC-EA
commit: 2868957900aa9a06e8d9eb6523f938947210f6e9
license: none
license_verdict: inspiration_only
stars: 0
last_commit: '2026-03-29'
language: MQL5-EA
symbols_targeted:
- XAUUSD
timeframes_targeted:
- M5
scout_verdict: promising
---

# Asia-London Range Expansion EA

## Core idea
Model the day in two phases: Asia session (00:00-06:00 UTC) builds a consolidation range; London open (07:00-10:00 UTC) expands it. Trade the expansion via three distinct setups: true breakout, breakout + retest, or breakout + reversal (liquidity grab).

## Entry rules
- Record Asia H/L between configurable UTC hours.
- Asia range must be within [MinRangeATR, MaxRangeATR] of ATR(14) to qualify.
- Breakout must occur within N bars from London window start (default 9).
- True breakout: displacement candle >= 1.2x ATR and breaks range by >= 0.5x ATR.
- Retest: within 5 bars, price returns to broken level within 0.2x ATR touch tolerance and max 0.3x ATR close-back-inside, then resumes direction.
- Reversal: fast failed breakout with strong opposite displacement.
- Optional: only first breakout per day; cooldown bars.

## Exit rules
- ATR-based SL (e.g. 0.75x ATR for true breakout).
- Fixed R:R TP (default 2.0) or optional range-projection TP.
- Optional close at end of London window.

## Key parameters
- InpATRPeriod=14, InpMinRangeATR=0.5, InpMaxRangeATR=2.0
- InpBreakoutDistanceATR=0.5, InpBreakoutCandleATR=1.2
- InpTrueBreakSL_ATR=0.75, InpTrueBreakRR=2.0
- Asia/Trade window UTC hours, UTC offset minutes
- InpRiskPercent optional position sizing

## Notable techniques worth stealing
- Everything ATR-normalized (range size, breakout strength, retest depth, SL/TP) → regime-robust.
- Three distinct playbooks from same range (BO / BO+retest / BO+reversal) with strict time windows.
- Liquidity-grab / recent-extreme bias filter to choose between continuation vs reversal.
- Clean UTC-offset-aware session handling, one-trade-per-day gate.

## Red flags
- No license file (treat as inspiration only).
- 0 stars, no published backtest metrics.
- Large parameter surface → optimization/overfit risk.

## Suggested adaptation for XAUUSD / GER40 M5/M15
- Direct fit for XAUUSD M5 as published; also natural for GER40 M5/M15 where the Asia→Frankfurt/London expansion pattern is textbook.
- For GER40: use 23:00-07:00 CET as Asia/overnight range and 08:00-10:00 CET as breakout window (DAX cash open).
- Reduce parameter count by fixing the three setups' ATR multipliers to single regime-agnostic values and only optimizing window hours + min/max range ATR.
