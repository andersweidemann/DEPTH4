"""Tests for agents/regime.py.

ADX and the full classifier are tested on synthetic fixtures that isolate each
regime. The goal is not to validate ADX against TA-Lib bit-for-bit (Wilder's
definition admits several valid implementations) but to pin this module's
behaviour so a refactor can't silently change the classifier outputs.
"""
from __future__ import annotations

import numpy as np
import pytest

from agents import regime
from tests.conftest import make_ohlc


# -------- ADX --------------------------------------------------------------

def test_adx_flat_series_low(flat_series_100):
    out = regime.adx(flat_series_100, 14)
    valid = out[~np.isnan(out)]
    # Constant series has no directional movement; ADX should be 0 or NaN.
    # Wilder ADX can produce 0/0 -> NaN which we tolerate.
    assert (valid < 1.0).all() or np.isnan(out[-1])


def test_adx_strong_uptrend_high(linear_uptrend):
    out = regime.adx(linear_uptrend, 14)
    tail = out[~np.isnan(out)][-20:]
    assert tail.mean() > 25.0, f"strong trend should give ADX > 25, got {tail.mean():.2f}"


def test_adx_bounded_0_to_100():
    closes = 100.0 + np.cumsum(np.sin(np.arange(500) * 0.2))
    data = make_ohlc(closes)
    out = regime.adx(data, 14)
    valid = out[~np.isnan(out)]
    assert (valid >= 0).all() and (valid <= 100).all()


# -------- ATR percentile ---------------------------------------------------

def test_atr_percentile_in_range(vol_spike):
    out = regime.atr_percentile(vol_spike, atr_period=14, lookback=100)
    valid = out[~np.isnan(out)]
    assert len(valid) > 0
    assert (valid >= 0).all() and (valid <= 1).all()


def test_atr_percentile_spike_reaches_top(vol_spike):
    # Final bar should be high-ATR compared to the prior calm window.
    out = regime.atr_percentile(vol_spike, atr_period=14, lookback=100)
    assert out[-1] == pytest.approx(1.0, abs=0.05)


# -------- Classifier -------------------------------------------------------

def test_classify_returns_allowed_labels(linear_uptrend):
    out = regime.classify(linear_uptrend, adx_period=14, atr_period=14,
                          atr_lookback=100)
    assert set(np.unique(out)).issubset(set(regime.REGIMES))


def test_classify_trend_dominates_on_uptrend(linear_uptrend):
    out = regime.classify(linear_uptrend, adx_period=14, atr_period=14,
                          atr_lookback=100)
    # In a pure linear uptrend, the majority of valid bars should be TREND.
    valid = out[50:]  # skip warmup
    trend_frac = (valid == "TREND").mean()
    assert trend_frac > 0.5, f"expected mostly TREND, got {trend_frac:.2f}"


def test_classify_zigzag_has_no_trend(zigzag):
    out = regime.classify(zigzag, adx_period=14, atr_period=14, atr_lookback=50)
    # A perfect alternation has no directional strength -> never TREND.
    trend_bars = (out == "TREND").sum()
    assert trend_bars == 0, f"zigzag should have no TREND bars, found {trend_bars}"


def test_classify_output_length_matches_input(linear_uptrend):
    out = regime.classify(linear_uptrend, adx_period=14, atr_period=14,
                          atr_lookback=100)
    assert len(out) == len(linear_uptrend.Close)


def test_classify_warmup_defaults_to_range():
    # Too few bars -> ADX and ATR percentile both NaN -> classifier picks RANGE.
    short = make_ohlc([100.0 + i * 0.01 for i in range(10)])
    out = regime.classify(short, adx_period=14, atr_period=14, atr_lookback=5)
    assert (out == "RANGE").all()
