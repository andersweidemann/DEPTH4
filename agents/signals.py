"""
Vectorized signal primitives for the Python backtester.

Every function here has a 1:1 twin in common/include/Signals.mqh. Keep behaviour
in sync; the VPS parity check diffs bar-by-bar output.

All functions take a `data` object that behaves like backtesting.py's _Data
(exposes .Close, .High, .Low, .Open as sequences), or plain numpy arrays.
Return values are numpy arrays aligned with the input.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def _as_series(x) -> pd.Series:
    arr = np.asarray(x, dtype=float)
    return pd.Series(arr)


def sma(data_or_arr, period: int) -> np.ndarray:
    s = _as_series(getattr(data_or_arr, "Close", data_or_arr))
    return s.rolling(period, min_periods=period).mean().to_numpy()


def ema(data_or_arr, period: int) -> np.ndarray:
    s = _as_series(getattr(data_or_arr, "Close", data_or_arr))
    return s.ewm(span=period, adjust=False, min_periods=period).mean().to_numpy()


def atr(data, period: int) -> np.ndarray:
    """Wilder ATR."""
    high = _as_series(data.High)
    low = _as_series(data.Low)
    close = _as_series(data.Close)
    prev_close = close.shift(1)
    tr = pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean().to_numpy()


def rsi(data_or_arr, period: int) -> np.ndarray:
    close = _as_series(getattr(data_or_arr, "Close", data_or_arr))
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    return (100.0 - (100.0 / (1.0 + rs))).to_numpy()


def bollinger(data_or_arr, period: int, mult: float = 2.0):
    """Return (upper, middle, lower) arrays."""
    s = _as_series(getattr(data_or_arr, "Close", data_or_arr))
    mid = s.rolling(period, min_periods=period).mean()
    std = s.rolling(period, min_periods=period).std(ddof=0)
    upper = mid + mult * std
    lower = mid - mult * std
    return upper.to_numpy(), mid.to_numpy(), lower.to_numpy()


def bb_width(data_or_arr, period: int, mult: float = 2.0) -> np.ndarray:
    upper, mid, lower = bollinger(data_or_arr, period, mult)
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(mid != 0, (upper - lower) / mid, np.nan)


def donchian(data, period: int):
    """Return (upper, lower) arrays: rolling high/low over `period` bars, shifted by 1
    to avoid referencing the current bar."""
    high = _as_series(data.High).shift(1)
    low = _as_series(data.Low).shift(1)
    return (
        high.rolling(period, min_periods=period).max().to_numpy(),
        low.rolling(period, min_periods=period).min().to_numpy(),
    )


def atr_breakout_levels(data, atr_period: int, mult: float):
    """Return (upper, lower) breakout levels based on prior close +/- mult*ATR.

    Computed from the prior bar so the current bar can be tested without lookahead.
    """
    a = atr(data, atr_period)
    close = _as_series(data.Close).shift(1).to_numpy()
    upper = close + mult * a
    lower = close - mult * a
    return upper, lower


def session_mask(index: pd.DatetimeIndex, sessions_utc) -> np.ndarray:
    """Boolean array: True where the bar's hour-of-day (UTC) falls within any
    of the given [start_hour, end_hour) half-open ranges.

    `sessions_utc` is a list of [start, end] pairs, e.g. [[6, 20]] for 06:00-20:00 UTC.
    """
    if index.tz is None:
        hours = index.hour
    else:
        hours = index.tz_convert("UTC").hour
    mask = np.zeros(len(index), dtype=bool)
    for start, end in sessions_utc:
        if start <= end:
            mask |= (hours >= start) & (hours < end)
        else:
            # wraps midnight, e.g. [22, 2]
            mask |= (hours >= start) | (hours < end)
    return mask


EXPORTS = [
    "sma", "ema", "atr", "rsi", "bollinger", "bb_width",
    "donchian", "atr_breakout_levels", "session_mask",
]
