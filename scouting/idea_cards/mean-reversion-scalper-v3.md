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

# Mean Reversion Scalper V3 (MQL5)

## Core idea
Scalp mean reversion on EURUSD M5 when price reaches BB extremes simultaneously with extreme short-period RSI, but only in sufficiently volatile regimes (BB-width percentile filter).

## Entry rules
- BUY: Close < Lower BB(20, 1.75) AND RSI(7) < 10.
- SELL: Close > Upper BB AND RSI(7) > 90.
- Filters: BB-width percentile > 30 (volatility gate), session 07:00–20:00, max spread 3 pips, ≥3-bar cooldown, min R:R ≥ 1.0.

## Exit rules
- TP: opposite Bollinger Band (full mean reversion), or middle BB / fixed RR (configurable).
- SL: 1.5 × ATR(14) from entry.
- Time exit: close after 30 bars (~2.5h) if neither hit.

## Key parameters
BB(20, 1.75), RSI(7) thresholds 10/90, ATR(14) × 1.5 SL, 30-bar time stop, 30th-percentile BB-width gate, session window, spread cap, cooldown.

## Notable techniques worth stealing
- **BB-width percentile regime filter**: only trade when volatility is in the upper 70% of its recent distribution — avoids dead markets.
- Time-based exit as a third leg alongside SL/TP (great for mean-reversion where stalling = thesis failure).
- Rigorous validation workflow: broad grid → focused → OOS → 5-fold walk-forward (204 configs).
- Honest synthetic data generation (GBM+GARCH, Student-t, Hurst ~0.45, session-dependent vol) as a sanity layer before real-data backtests.

## Red flags
- Zero stars, no license; results on synthetic (not live tick) data — real-broker slippage/spread will bite.
- 34% win rate with tight RSI thresholds means few trades and high sensitivity to optimization.
- Not targeted at XAUUSD/GER40 — behavior will differ.

## Suggested adaptation for XAUUSD / GER40 M5/M15
- Port the **BB-width percentile regime filter** as a reusable indicator module in our framework.
- For XAUUSD M5: loosen RSI thresholds (15/85) and widen SL (2.0–2.5 × ATR) due to higher tail risk; keep time-stop concept.
- For GER40 M15: mean-reversion works best mid-day; restrict session to 09:00–16:30 CET and avoid the cash open.
- Reuse the 4-stage optimization protocol (broad → focused → OOS → walk-forward) as our template for all future strategies.
