"""Shared pytest fixtures.

Synthetic OHLC data used here is deterministic so tests are stable - no RNG
calls at module import time; per-test fixtures may seed locally.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np
import pandas as pd
import pytest


@dataclass
class FakeData:
    """Mimics backtesting.py's _Data interface for the signal primitives."""
    Open: np.ndarray
    High: np.ndarray
    Low: np.ndarray
    Close: np.ndarray
    _index: pd.DatetimeIndex

    @property
    def index(self) -> pd.DatetimeIndex:
        return self._index


def make_ohlc(close: Sequence[float], *, high_offset: float = 0.5,
              low_offset: float = 0.5,
              start: str = "2023-01-02 00:00",
              freq: str = "5min") -> FakeData:
    close_arr = np.asarray(close, dtype=float)
    n = len(close_arr)
    idx = pd.date_range(start=start, periods=n, freq=freq, tz="UTC")
    return FakeData(
        Open=close_arr.copy(),
        High=close_arr + high_offset,
        Low=close_arr - low_offset,
        Close=close_arr,
        _index=idx,
    )


@pytest.fixture
def flat_series_100() -> FakeData:
    """100 bars at constant price 100.0 - easy-to-reason-about edge case."""
    return make_ohlc([100.0] * 100)


@pytest.fixture
def linear_uptrend() -> FakeData:
    """200 bars rising linearly from 100 to 300 - pure trend regime."""
    closes = np.linspace(100.0, 300.0, 200)
    return make_ohlc(closes)


@pytest.fixture
def zigzag() -> FakeData:
    """200 alternating up/down bars around 100 - pure range regime, no drift."""
    closes = 100.0 + np.tile([+1.0, -1.0], 100)
    return make_ohlc(closes)


@pytest.fixture
def vol_spike() -> FakeData:
    """300 flat bars then 50 high-volatility bars - isolates ATR percentile."""
    base = np.full(300, 100.0)
    spikes = 100.0 + np.tile([+5.0, -5.0], 25)
    return make_ohlc(
        np.concatenate([base, spikes]),
        high_offset=2.0, low_offset=2.0,
    )


@pytest.fixture
def hourly_index() -> pd.DatetimeIndex:
    """72 hours (3 days) of hourly timestamps, UTC."""
    return pd.date_range("2024-01-01 00:00", periods=72, freq="1h", tz="UTC")
