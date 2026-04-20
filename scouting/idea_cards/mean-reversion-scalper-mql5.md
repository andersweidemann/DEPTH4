---
source_url: https://github.com/sbrakni/mean-reversion-mql5
commit: c021474bb25848982df80f32ee94d2b534ae8a52
license: MIT
license_verdict: port_allowed
stars: 0
last_commit: '2026-02-16'
language: MQL5
symbols_targeted:
- XAUUSD
timeframes_targeted:
- M5
- M15
scout_verdict: promising
---

# Mean Reversion Scalper V3 (MQL5)

A mean reversion scalping Expert Advisor for MetaTrader 5, optimized via multi-session backtesting over 3 years on EURUSD M5.

## Strategy Overview

**Core Logic:** When price reaches extreme deviations from its mean (outside Bollinger Bands) with extreme RSI readings, enter a trade expecting price to revert back toward the mean.

### Indicators
- **Bollinger Bands** (20 period, 1.75 deviation) - identifies price deviations
- **RSI(7)** - catches momentum exhaustion
- **ATR(14)** - dynamic stop loss sizing

### Entry Rules
- **BUY:** Close < Lower BB AND RSI(7) < 10 (oversold)
- **SELL:** Close > Upper BB AND RSI(7) > 90 (overbought)

### Exit Rules
- **Take Profit:** Opposite Bollinger Band (full mean reversion)
- **Stop Loss:** 1.5x ATR from entry
- **Time Exit:** Close after 30 bars (~2.5 hours) if neither SL/TP hit

### Filters
- **BB Width Percentile:** Only trade when volatility > 30th percentile
- **Session Filter:** London open to NY close (07:00-20:00)
- **Spread Filter:** Max 3 pips
- **Cooldown:** 3 bars minimum between trades
- **Minimum R:R:** 1.0

## Optimization Process

The EA was optimized using a 4-session process with 204 total configurations tested:

| Session | Description | Configs | Result |
|---------|-------------|---------|--------|
| 1. Broad Grid | Systematic search across BB dev, RSI, SL, TP modes | 124 | 37 profitable |
| 2. Focused | Fine-tuning around top 5 performers | 80 | Best: BB1.75+RSI7 |
| 3. OOS Validation | Top 10 on unseen 30% data | 10 | 10/10 passed |
| 4. Walk-Forward | 5-fold time-series validation | 5 folds | 5/5 passed |

### Data Model
Synthetic data calibrated to empirical EURUSD M5 statistics:
- GBM + GARCH(1,1) volatility clustering
- Student-t fat tails (df=5)
- Calibrated intraday mean reversion (Hurst exponent ~0.45)
- Session-dependent volatility (London > NY > Asia)
- Realistic spread, commission ($7/lot), and slippage (0.3 pips)

## Backtest Results (Best Configur
