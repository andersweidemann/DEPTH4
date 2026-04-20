"""
Regime classification primitives.

Every function here has a 1:1 twin in common/include/Regime.mqh.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from agents import signals


REGIMES = ("TREND", "RANGE", "VOLATILE", "QUIET")


def adx(data, period: int = 14) -> np.ndarray:
    """Wilder ADX."""
    high = pd.Series(np.asarray(data.High, dtype=float))
    low = pd.Series(np.asarray(data.Low, dtype=float))
    close = pd.Series(np.asarray(data.Close, dtype=float))

    up_move = high.diff()
    down_move = -low.diff()
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    tr = pd.concat(
        [(high - low),
         (high - close.shift(1)).abs(),
         (low - close.shift(1)).abs()],
        axis=1,
    ).max(axis=1)

    atr_ = tr.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()
    plus_di = 100.0 * pd.Series(plus_dm).ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean() / atr_
    minus_di = 100.0 * pd.Series(minus_dm).ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean() / atr_
    dx = 100.0 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0.0, np.nan)
    return dx.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean().to_numpy()


def atr_percentile(data, atr_period: int = 14, lookback: int = 250) -> np.ndarray:
    """Rolling percentile (0..1) of current ATR vs prior `lookback` ATRs.

    Used to separate VOLATILE (high percentile) from QUIET (low percentile).
    """
    a = pd.Series(signals.atr(data, atr_period))
    return a.rolling(lookback, min_periods=lookback).apply(
        lambda w: (w.rank(pct=True).iloc[-1]), raw=False,
    ).to_numpy()


def classify(data, adx_period: int = 14, atr_period: int = 14,
             atr_lookback: int = 250, adx_trend_min: float = 25.0,
             atr_vol_hi: float = 0.8, atr_quiet_lo: float = 0.2) -> np.ndarray:
    """Return an array of regime strings per bar.

    Rules (evaluated in order):
      - ADX >= adx_trend_min -> TREND
      - ATR percentile >= atr_vol_hi -> VOLATILE
      - ATR percentile <= atr_quiet_lo -> QUIET
      - else -> RANGE
    """
    adx_ = adx(data, adx_period)
    atrp = atr_percentile(data, atr_period, atr_lookback)
    n = len(adx_)
    out = np.full(n, "RANGE", dtype=object)
    for i in range(n):
        if np.isnan(adx_[i]):
            out[i] = "RANGE"
            continue
        if adx_[i] >= adx_trend_min:
            out[i] = "TREND"
        elif not np.isnan(atrp[i]) and atrp[i] >= atr_vol_hi:
            out[i] = "VOLATILE"
        elif not np.isnan(atrp[i]) and atrp[i] <= atr_quiet_lo:
            out[i] = "QUIET"
        else:
            out[i] = "RANGE"
    return out


EXPORTS = ["adx", "atr_percentile", "classify", "REGIMES"]
