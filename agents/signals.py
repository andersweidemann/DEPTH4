"""
Vectorized signal primitives for the Python backtester.

Every function here has a 1:1 twin in common/include/Signals.mqh. Keep behaviour
in sync; the VPS parity check diffs bar-by-bar output.

All functions take a `data` object that behaves like backtesting.py's _Data
(exposes .Close, .High, .Low, .Open as sequences), or plain numpy arrays.
Return values are numpy arrays aligned with the input.
"""
from __future__ import annotations

from typing import Any, List, Tuple, Union

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


class _OHLC:
    """Minimal OHLC holder for vectorized helpers when only arrays are available."""

    __slots__ = ("Open", "High", "Low", "Close")

    def __init__(self, high, low, close, open_=None):
        self.High = high
        self.Low = low
        self.Close = close
        self.Open = close if open_ is None else open_


class _HL:
    __slots__ = ("High", "Low")

    def __init__(self, high, low):
        self.High = high
        self.Low = low


def _atr_wilder(data, period: int) -> np.ndarray:
    """Wilder ATR from any object exposing High, Low, Close (array-like)."""
    high = _as_series(data.High)
    low = _as_series(data.Low)
    close = _as_series(data.Close)
    prev_close = close.shift(1)
    tr = pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean().to_numpy()


def atr(*args) -> np.ndarray:
    """Wilder ATR.

    Forms:
      - ``atr(data, period)`` — ``data`` has ``.High``, ``.Low``, ``.Close`` (e.g. ``self.data``).
      - ``atr(high, low, close, period)`` — separate series (common with ``backtesting.py``'s
        ``self.I(signals.atr, self.data.High, self.data.Low, self.data.Close, n)``).
    """
    if len(args) == 2:
        return _atr_wilder(args[0], int(args[1]))
    if len(args) == 4:
        h, l, c, period = args
        return _atr_wilder(_OHLC(h, l, c), int(period))
    raise TypeError(
        "atr() expected (data, period) or (high, low, close, period); "
        f"got {len(args)} positional args",
    )


def rsi(data_or_arr, period: int) -> np.ndarray:
    close = _as_series(getattr(data_or_arr, "Close", data_or_arr))
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    out = 100.0 - (100.0 / (1.0 + rs))
    # Wilder RSI: zero average loss with positive average gain => RS = +inf => RSI = 100.
    ag = avg_gain.to_numpy()
    al = avg_loss.to_numpy()
    out_np = out.to_numpy()
    out_np = np.where((al == 0.0) & (ag > 0.0), 100.0, out_np)
    out_np = np.where((al == 0.0) & (ag == 0.0), 50.0, out_np)
    return out_np


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


def _donchian_wilder(data, period: int):
    """Return (upper, lower) Donchian arrays; ``data`` has High, Low."""
    high = _as_series(data.High).shift(1)
    low = _as_series(data.Low).shift(1)
    return (
        high.rolling(period, min_periods=period).max().to_numpy(),
        low.rolling(period, min_periods=period).min().to_numpy(),
    )


def donchian(*args):
    """Return (upper, lower): rolling high/low over ``period`` bars, shifted by 1.

    Forms:
      - ``donchian(data, period)`` — ``data`` has ``.High``, ``.Low``.
      - ``donchian(high, low, period)`` — separate series (``self.I(..., H, L, n)``).
    """
    if len(args) == 2:
        return _donchian_wilder(args[0], int(args[1]))
    if len(args) == 3:
        h, l, period = args
        return _donchian_wilder(_HL(h, l), int(period))
    raise TypeError(
        "donchian() expected (data, period) or (high, low, period); "
        f"got {len(args)} positional args",
    )


def atr_breakout_levels(data, atr_period: int, mult: float):
    """Return (upper, lower) breakout levels based on prior close +/- mult*ATR.

    Computed from the prior bar so the current bar can be tested without lookahead.
    """
    a = _atr_wilder(data, atr_period)
    close = _as_series(data.Close).shift(1).to_numpy()
    upper = close + mult * a
    lower = close - mult * a
    return upper, lower


def _parse_time_token(tok: str) -> float:
    """Return hour as float (e.g. '07:30' -> 7.5)."""
    parts = str(tok).strip().split(":")
    h = float(parts[0])
    m = float(parts[1]) if len(parts) > 1 else 0.0
    s = float(parts[2]) if len(parts) > 2 else 0.0
    return h + m / 60.0 + s / 3600.0


def _session_span_hours(start: Any, end: Any) -> Tuple[float, float]:
    if isinstance(start, str):
        sa = _parse_time_token(start)
    else:
        sa = float(start)
    if isinstance(end, str):
        ea = _parse_time_token(end)
    else:
        ea = float(end)
    return sa, ea


def _normalize_sessions(sessions_utc: Union[str, List[Any], Tuple[Any, ...], None],
                        ) -> List[Tuple[float, float]]:
    """Accept int hour pairs, 'HH:MM' strings, dicts, or 'HH:MM-HH:MM' shorthands."""
    if sessions_utc is None:
        return []
    if isinstance(sessions_utc, str):
        sessions_utc = [sessions_utc]
    out: List[Tuple[float, float]] = []
    for item in sessions_utc:
        if isinstance(item, str):
            s = item.strip()
            if "-" in s:
                left, right = s.split("-", 1)
                out.append(_session_span_hours(left, right))
            else:
                raise ValueError(
                    f"session_mask: expected 'HH:MM-HH:MM' or list/tuple/dict, got {item!r}",
                )
        elif isinstance(item, dict):
            out.append(_session_span_hours(item.get("start"), item.get("end")))
        elif isinstance(item, (list, tuple)):
            if len(item) != 2:
                raise ValueError(f"session_mask: range must be length-2, got {item!r}")
            out.append(_session_span_hours(item[0], item[1]))
        else:
            raise TypeError(f"session_mask: unsupported session entry {item!r}")
    return out


def session_mask(index: pd.DatetimeIndex, sessions_utc) -> np.ndarray:
    """Boolean array: True where the bar's time-of-day (UTC) falls within any
    half-open session range.

    ``sessions_utc`` may be:

    * ``[[7, 16]]`` — integer **hours** (legacy; same as 07:00–16:00).
    * ``[("07:00", "11:00"), ...]`` — string clock times.
    * ``[{"start": "07:00", "end": "11:00"}, ...]`` — dict form from specs.
    * ``["07:00-11:00"]`` — single-string span per session.
    """
    if getattr(index, "tz", None) is None:
        series = index
    else:
        series = index.tz_convert("UTC")
    hour = series.hour.to_numpy(dtype=np.float64)
    minute = series.minute.to_numpy(dtype=np.float64)
    second = series.second.to_numpy(dtype=np.float64)
    tod = hour + minute / 60.0 + second / 3600.0

    spans = _normalize_sessions(sessions_utc)
    mask = np.zeros(len(index), dtype=bool)
    for start, end in spans:
        if start <= end:
            mask |= (tod >= start) & (tod < end)
        else:
            mask |= (tod >= start) | (tod < end)
    return mask


EXPORTS = [
    "sma", "ema", "atr", "rsi", "bollinger", "bb_width",
    "donchian", "atr_breakout_levels", "session_mask",
]
