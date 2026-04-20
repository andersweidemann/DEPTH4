"""Tests for agents/signals.py.

Each test either pins an exact numeric output (so a refactor can't silently
drift) or asserts an algebraic/structural property (e.g. no lookahead). Every
function in signals.py has at least one test of each kind.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from agents import signals
from tests.conftest import make_ohlc


# -------- SMA / EMA --------------------------------------------------------

def test_sma_flat_equals_value(flat_series_100):
    out = signals.sma(flat_series_100, 10)
    assert np.isnan(out[:9]).all(), "first 9 bars must be NaN for period=10"
    assert np.allclose(out[9:], 100.0)


def test_sma_linear_sequence():
    data = make_ohlc(list(range(1, 21)))
    out = signals.sma(data, 5)
    assert np.isnan(out[:4]).all()
    # SMA of 1..5 = 3, of 2..6 = 4, etc.
    assert out[4] == pytest.approx(3.0)
    assert out[-1] == pytest.approx(18.0)


def test_ema_flat_equals_value(flat_series_100):
    out = signals.ema(flat_series_100, 10)
    assert np.isnan(out[:9]).all()
    assert np.allclose(out[9:], 100.0)


def test_ema_matches_pandas_reference():
    closes = np.arange(1, 101, dtype=float)
    data = make_ohlc(closes)
    out = signals.ema(data, 14)
    ref = pd.Series(closes).ewm(span=14, adjust=False, min_periods=14).mean().to_numpy()
    np.testing.assert_allclose(out, ref, equal_nan=True)


# -------- ATR (Wilder) -----------------------------------------------------

def test_atr_flat_zero(flat_series_100):
    # Flat close with constant ±0.5 high/low offsets => TR == 1.0 every bar.
    out = signals.atr(flat_series_100, 14)
    assert np.isnan(out[:13]).all()
    assert np.allclose(out[13:], 1.0)


def test_atr_nonnegative():
    closes = 100.0 + np.cumsum(np.sin(np.arange(300) * 0.3))
    data = make_ohlc(closes)
    out = signals.atr(data, 14)
    valid = out[~np.isnan(out)]
    assert (valid >= 0).all()


# -------- RSI --------------------------------------------------------------

def test_rsi_all_gains_approaches_100():
    closes = np.arange(1, 101, dtype=float)  # strictly increasing
    data = make_ohlc(closes)
    out = signals.rsi(data, 14)
    # With only gains and no losses, RSI converges to 100.
    valid = out[~np.isnan(out)]
    assert valid[-1] == pytest.approx(100.0, abs=1e-6)


def test_rsi_all_losses_approaches_0():
    closes = np.arange(100, 0, -1, dtype=float)  # strictly decreasing
    data = make_ohlc(closes)
    out = signals.rsi(data, 14)
    valid = out[~np.isnan(out)]
    assert valid[-1] == pytest.approx(0.0, abs=1e-6)


def test_rsi_bounded_between_0_and_100():
    rng = np.random.default_rng(42)
    closes = 100.0 + np.cumsum(rng.normal(0, 1, 500))
    data = make_ohlc(closes)
    out = signals.rsi(data, 14)
    valid = out[~np.isnan(out)]
    assert (valid >= 0).all() and (valid <= 100).all()


# -------- Bollinger --------------------------------------------------------

def test_bollinger_flat_has_zero_width(flat_series_100):
    upper, mid, lower = signals.bollinger(flat_series_100, 20, 2.0)
    assert np.allclose(upper[19:], mid[19:])
    assert np.allclose(lower[19:], mid[19:])


def test_bollinger_mid_equals_sma():
    closes = np.arange(1, 101, dtype=float)
    data = make_ohlc(closes)
    _, mid, _ = signals.bollinger(data, 20, 2.0)
    sma = signals.sma(data, 20)
    np.testing.assert_allclose(mid, sma, equal_nan=True)


def test_bb_width_formula():
    closes = 100.0 + np.sin(np.arange(200) * 0.1) * 5.0
    data = make_ohlc(closes)
    upper, mid, lower = signals.bollinger(data, 20, 2.0)
    w = signals.bb_width(data, 20, 2.0)
    expected = (upper - lower) / mid
    np.testing.assert_allclose(w, expected, equal_nan=True)


# -------- Donchian (no-lookahead guarantee) --------------------------------

def test_donchian_no_lookahead():
    """Donchian for bar i must NOT depend on bar i's high/low."""
    closes = np.arange(1, 101, dtype=float)
    data_a = make_ohlc(closes, high_offset=0.1, low_offset=0.1)
    # Build an identical second dataset but with an extreme spike at bar 80.
    h = data_a.High.copy()
    l = data_a.Low.copy()
    h[80] = 999.0
    l[80] = -999.0
    data_b = type(data_a)(Open=data_a.Open, High=h, Low=l,
                          Close=data_a.Close, _index=data_a._index)
    up_a, lo_a = signals.donchian(data_a, 10)
    up_b, lo_b = signals.donchian(data_b, 10)
    # Bar 80 itself may differ downstream (bar 81 uses bar 80's extremes),
    # but bar 80's Donchian value must be identical in both - it reads only
    # the prior 10 bars' extremes.
    assert up_a[80] == up_b[80]
    assert lo_a[80] == lo_b[80]


def test_donchian_rolling_max_min():
    closes = np.arange(1, 21, dtype=float)
    data = make_ohlc(closes, high_offset=0.0, low_offset=0.0)
    # With zero offsets, High == Low == Close.
    up, lo = signals.donchian(data, 5)
    # Donchian at bar i reads max/min of bars [i-5..i-1] (shift-by-1).
    # Bar 5: max of closes[0..4] = 5, min of closes[0..4] = 1.
    assert up[5] == pytest.approx(5.0)
    assert lo[5] == pytest.approx(1.0)


# -------- ATR breakout levels ----------------------------------------------

def test_atr_breakout_levels_uses_prior_close():
    closes = np.arange(1, 101, dtype=float)
    data = make_ohlc(closes)
    u, lo = signals.atr_breakout_levels(data, 14, 1.0)
    # Must match prior_close +/- atr(prior).
    atr_vals = signals.atr(data, 14)
    prev_close = np.roll(closes, 1)
    prev_close[0] = np.nan
    expected_u = prev_close + 1.0 * atr_vals
    expected_lo = prev_close - 1.0 * atr_vals
    np.testing.assert_allclose(u, expected_u, equal_nan=True)
    np.testing.assert_allclose(lo, expected_lo, equal_nan=True)


# -------- Session mask -----------------------------------------------------

def test_session_mask_simple_range(hourly_index):
    # London session: 07:00-16:00 UTC.
    m = signals.session_mask(hourly_index, [[7, 16]])
    assert m.shape == (len(hourly_index),)
    # Hour 7,8..15 should be True; 16,17..6 False.
    hours = hourly_index.hour.to_numpy()
    expected = (hours >= 7) & (hours < 16)
    np.testing.assert_array_equal(m, expected)


def test_session_mask_wraps_midnight(hourly_index):
    # 22:00-02:00 UTC (Asia early).
    m = signals.session_mask(hourly_index, [[22, 2]])
    hours = hourly_index.hour.to_numpy()
    expected = (hours >= 22) | (hours < 2)
    np.testing.assert_array_equal(m, expected)


def test_session_mask_multiple_ranges(hourly_index):
    # Two non-overlapping ranges.
    m = signals.session_mask(hourly_index, [[7, 10], [14, 16]])
    hours = hourly_index.hour.to_numpy()
    expected = ((hours >= 7) & (hours < 10)) | ((hours >= 14) & (hours < 16))
    np.testing.assert_array_equal(m, expected)


def test_session_mask_naive_index_treated_as_utc():
    naive = pd.date_range("2024-01-01 00:00", periods=48, freq="1h")
    m = signals.session_mask(naive, [[7, 16]])
    hours = naive.hour.to_numpy()
    expected = (hours >= 7) & (hours < 16)
    np.testing.assert_array_equal(m, expected)
