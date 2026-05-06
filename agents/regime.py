"""
Regime classification primitives.

Every function here has a 1:1 twin in common/include/Regime.mqh.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from agents import signals


REGIMES = ("TREND", "RANGE", "VOLATILE", "QUIET")


def _has_hlc(obj) -> bool:
    return all(hasattr(obj, a) for a in ("High", "Low", "Close"))


def _adx_impl(data, period: int) -> np.ndarray:
    """Wilder ADX from an object with High, Low, Close."""
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


def adx(*args) -> np.ndarray:
    """Wilder ADX.

    Forms:
      - ``adx(data, period)`` — ``data`` has ``.High``, ``.Low``, ``.Close``.
      - ``adx(high, low, close, period)`` — array/Series OHLC columns.
    """
    if len(args) == 2:
        return _adx_impl(args[0], int(args[1]))
    if len(args) == 4:
        h, l, c, period = args
        return _adx_impl(signals._OHLC(h, l, c), int(period))
    raise TypeError(
        "adx() expected (data, period) or (high, low, close, period); "
        f"got {len(args)} positional args",
    )


def atr_percentile(*args, **kwargs) -> np.ndarray:
    """Rolling percentile (0..1) of ATR vs its own prior window.

    Forms:
      - ``atr_percentile(data, atr_period=14, lookback=250)`` (keywords or positional).
      - ``atr_percentile(data, atr_period, lookback)`` — three-arg OHLC.
      - ``atr_percentile(high, low, close, atr_period, lookback)`` — explicit OHLC arrays.
      - ``atr_percentile(atr_series, lookback)`` — ATR already computed (e.g. from ``self.I``).
    """
    if kwargs.keys() - {"atr_period", "lookback"}:
        bad = set(kwargs) - {"atr_period", "lookback"}
        raise TypeError(f"atr_percentile: unexpected keyword arguments {bad!r}")

    def _rolling_pctile(a: pd.Series, lookback: int) -> np.ndarray:
        lb = int(lookback)
        return a.rolling(lb, min_periods=lb).apply(
            lambda w: (w.rank(pct=True).iloc[-1]), raw=False,
        ).to_numpy()

    kw_atr = kwargs.get("atr_period", None)
    kw_lb = kwargs.get("lookback", None)

    if len(args) == 5:
        h, l, c, atr_period, lookback = args
        data = signals._OHLC(h, l, c)
        a = pd.Series(signals.atr(data, int(atr_period)))
        return _rolling_pctile(a, lookback)
    if len(args) == 4:
        h, l, c, atr_period = args
        data = signals._OHLC(h, l, c)
        a = pd.Series(signals.atr(data, int(atr_period)))
        lb = kw_lb if kw_lb is not None else 250
        return _rolling_pctile(a, lb)
    if len(args) == 3:
        data, atr_period, lookback = args
        if not _has_hlc(data):
            raise TypeError(
                "atr_percentile(data, atr_period, lookback) requires data with High/Low/Close",
            )
        a = pd.Series(signals.atr(data, int(atr_period)))
        return _rolling_pctile(a, int(lookback))
    if len(args) == 2:
        first, second = args
        if _has_hlc(first):
            a = pd.Series(signals.atr(first, int(second)))
            lb = kw_lb if kw_lb is not None else 250
            return _rolling_pctile(a, lb)
        a = pd.Series(np.asarray(first, dtype=float))
        return _rolling_pctile(a, int(second))
    if len(args) == 1:
        first = args[0]
        if _has_hlc(first):
            ap = int(kw_atr) if kw_atr is not None else 14
            lb = int(kw_lb) if kw_lb is not None else 250
            a = pd.Series(signals.atr(first, ap))
            return _rolling_pctile(a, lb)
        if kw_lb is None:
            raise TypeError(
                "atr_percentile(precomputed_atr, lookback=...) needs lookback= keyword",
            )
        a = pd.Series(np.asarray(first, dtype=float))
        return _rolling_pctile(a, int(kw_lb))
    raise TypeError(
        "atr_percentile() expected (data, atr_period), (data, atr_period, lookback), "
        "(high, low, close, atr_period), (high, low, close, atr_period, lookback), "
        f"(atr_series, lookback), or (data,) with keywords; got {len(args)} args",
    )


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
