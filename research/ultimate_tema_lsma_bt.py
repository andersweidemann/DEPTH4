#!/usr/bin/env python3
"""
Approximate replica of the TradingView Pine strategy:
  ULTIMATE TEMA/LSMA + IDEAL + REVERSAL + INSTITUTIONAL + DAVIN MA [DYNAMIC]

Purpose: offline backtest on BTCUSD (M15/H1/D1 via `--tf`) using cached OHLCV +
Pepperstone-ish costs from config.yaml (see symbols.btcusd).

DISCLAIMERS (read before trusting numbers):
  - Pine semantics (session VWAP, tick fills, trailing exits, broker leverage) differ
    from this bar-based simulator.
  - Higher TFs built from cached M15 inherit aggregation differences vs native TV bars.
  - Institutional / zone logic follows the pasted Pine structure; pivots/BoS are
    replicated with standard rolling definitions — small deviations vs TV are normal.

Outputs Profit Factor (gross), net PF after spread+commission model, trade count,
and basic equity curve metrics.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

# Repo imports
_REPO = Path(__file__).resolve().parents[1]
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

from agents import config as cfg_mod  # noqa: E402
from agents.data_fetch import load_ohlcv  # noqa: E402


# --- Defaults mirror Pine inputs from the user's script -------------------------

TEMA_LENGTH = 9
LSMA_LENGTH = 25
EMA100_LENGTH = 100
TAKE_PROFIT_ATR_MULT = 3.0
STOP_LOSS_ATR_MULT = 1.5
TRAIL_ATR_MULT = 1.0
MAX_BARS_IN_TRADE = 25
VOL_LENGTH = 20
MIN_VOL_MULT = 1.2

USE_TREND_EXHAUSTION = True
MIN_TREND_BARS = 10
MOMENTUM_DIVERGENCE = True
REQUIRE_TREND_ALIGNMENT = True
USE_TREND_STRENGTH = True
TREND_STRENGTH_THRESHOLD = 0.5

USE_IDEAL = True
PIVOT_LOOKBACK = 5
MIN_SWEEP_ATR = 0.5  # adaptive for BITCOIN from Pine
RETEST_TOLERANCE = 0.005  # adaptive BITCOIN
MAX_TEST_COUNT = 3
ATR_TEST_PERCENT = 0.5  # adaptive BITCOIN

ENABLE_REVERSALS = True
KAMA_LEN_REV = 10
ADX_LEN = 14
ADX_STRONG = 20.0
RSI_LEN = 14
RSI_OB = 70.0
RSI_OS = 30.0
WILL_LEN = 14
WILL_OB = -20.0
WILL_OS = -80.0
LIQ_ZONE_BARS = 8
MIN_VOL_MULT_REV = 1.0

USE_INSTITUTIONAL = True
INST_SWING_LB = 20
INST_ZONE_ATR_W = 0.5
INST_MID_ATR_BUF = 0.25
INST_BASE_SIZE = 10.0
INST_SCALE = True
USE_VWAP_MID = True

USE_DAVIN = True
DAVIN_MA_LONG = 200
DAVIN_MA_SHORT = 10
DAVIN_BUY_DIP = True
DAVIN_DIP_TRIGGER = 14
DAVIN_LOWER_CLOSE = True

INSTRUMENT_TYPE = "BITCOIN"


# ---------------------------------------------------------------------------


def _ema(series: np.ndarray, length: int) -> np.ndarray:
    s = pd.Series(series, dtype=float)
    return s.ewm(span=length, adjust=False, min_periods=length).mean().to_numpy()


def _sma(series: np.ndarray, length: int) -> np.ndarray:
    return pd.Series(series, dtype=float).rolling(length, min_periods=length).mean().to_numpy()


def _rsi(close: np.ndarray, length: int = 14) -> np.ndarray:
    s = pd.Series(close, dtype=float)
    delta = s.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    ag = gain.ewm(alpha=1.0 / length, adjust=False, min_periods=length).mean()
    al = loss.ewm(alpha=1.0 / length, adjust=False, min_periods=length).mean()
    rs = ag / np.where(al == 0.0, np.nan, al)
    return (100.0 - (100.0 / (1.0 + rs))).to_numpy()


def _atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14) -> np.ndarray:
    h = pd.Series(high, dtype=float)
    l = pd.Series(low, dtype=float)
    c = pd.Series(close, dtype=float)
    prev = c.shift(1)
    tr = pd.concat([(h - l), (h - prev).abs(), (l - prev).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean().to_numpy()


def _tema(close: np.ndarray, length: int) -> np.ndarray:
    e1 = _ema(close, length)
    e2 = _ema(e1, length)
    e3 = _ema(e2, length)
    return 3.0 * e1 - 3.0 * e2 + e3


def _linreg_end(close: np.ndarray, length: int) -> np.ndarray:
    """Pine ta.linreg(src, length, 0): linreg value at last bar of window."""
    n = len(close)
    out = np.full(n, np.nan, dtype=float)
    x = np.arange(length, dtype=float)
    for i in range(length - 1, n):
        y = close[i - length + 1 : i + 1]
        if np.any(np.isnan(y)):
            continue
        slope, intercept = np.polyfit(x, y, 1)
        out[i] = slope * (length - 1) + intercept
    return out


def _macd(close: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    ema12 = _ema(close, 12)
    ema26 = _ema(close, 26)
    macd_line = ema12 - ema26
    signal_line = _ema(macd_line, 9)
    hist = macd_line - signal_line
    return macd_line, signal_line, hist


def _adx_di(high: np.ndarray, low: np.ndarray, close: np.ndarray, length: int) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Returns adx, plusDI, minusDI (Wilder-style)."""
    h = pd.Series(high)
    l = pd.Series(low)
    c = pd.Series(close)
    up_move = h.diff()
    down_move = -l.diff()
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    tr = pd.concat([(h - l), (h - c.shift(1)).abs(), (l - c.shift(1)).abs()], axis=1).max(axis=1)

    atr_ = tr.ewm(alpha=1.0 / length, adjust=False, min_periods=length).mean()
    plus_di = 100.0 * (
        pd.Series(plus_dm).ewm(alpha=1.0 / length, adjust=False, min_periods=length).mean() / atr_
    )
    minus_di = 100.0 * (
        pd.Series(minus_dm).ewm(alpha=1.0 / length, adjust=False, min_periods=length).mean() / atr_
    )
    dx = (100.0 * (plus_di - minus_di).abs() / (plus_di + minus_di)).replace([np.inf, -np.inf], np.nan)
    adx = dx.ewm(alpha=1.0 / length, adjust=False, min_periods=length).mean().to_numpy()
    return adx, plus_di.to_numpy(), minus_di.to_numpy()


def _stoch_k_d(high: np.ndarray, low: np.ndarray, close: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Matches Pine: sma(stoch(close,high,low,9), 6), signal sma(k,3)."""
    n = len(close)
    k_raw = np.full(n, np.nan)
    for i in range(8, n):
        hh = np.nanmax(high[i - 8 : i + 1])
        ll = np.nanmin(low[i - 8 : i + 1])
        if hh == ll:
            k_raw[i] = 0.0
        else:
            k_raw[i] = 100.0 * (close[i] - ll) / (hh - ll)
    k = _sma(k_raw, 6)
    d = _sma(k, 3)
    return k, d


def _williams_r(high: np.ndarray, low: np.ndarray, close: np.ndarray, length: int) -> np.ndarray:
    out = np.full(len(close), np.nan)
    for i in range(length - 1, len(close)):
        hh = np.nanmax(high[i - length + 1 : i + 1])
        ll = np.nanmin(low[i - length + 1 : i + 1])
        if hh == ll:
            out[i] = -50.0
        else:
            out[i] = -100.0 * (hh - close[i]) / (hh - ll)
    return out


def _session_vwap_dayUTC(df: pd.DataFrame) -> np.ndarray:
    """Daily anchored VWAP (UTC day) using typical price."""
    idx = df.index
    day = idx.normalize()
    tp = (df["high"].values + df["low"].values + df["close"].values) / 3.0
    vol = df["volume"].values.astype(float)
    pv = pd.Series(tp * vol, index=idx)
    vv = pd.Series(vol, index=idx)
    cum_pv = pv.groupby(day).cumsum()
    cum_v = vv.groupby(day).cumsum()
    vwap = (cum_pv / cum_v.replace(0.0, np.nan)).to_numpy()
    return vwap


def _pivothigh(high: np.ndarray, left: int, right: int) -> np.ndarray:
    """Returns pivot price at confirmation bar (na if none)."""
    n = len(high)
    out = np.full(n, np.nan)
    for i in range(left + right, n):
        center = i - right
        w = high[center - left : center + right + 1]
        if np.isnan(w).any():
            continue
        if high[center] >= np.nanmax(w) and high[center] > np.nanmax(
            np.concatenate([w[:left], w[left + 1 :]])
        ):
            out[i] = high[center]
    return out


def _pivotlow(low: np.ndarray, left: int, right: int) -> np.ndarray:
    n = len(low)
    out = np.full(n, np.nan)
    for i in range(left + right, n):
        center = i - right
        w = low[center - left : center + right + 1]
        if np.isnan(w).any():
            continue
        if low[center] <= np.nanmin(w) and low[center] < np.nanmin(
            np.concatenate([w[:left], w[left + 1 :]])
        ):
            out[i] = low[center]
    return out


@dataclass
class Trade:
    side: str  # "long" / "short"
    entry_i: int
    exit_i: int
    entry_px: float
    exit_px: float
    gross_pnl: float
    costs: float


def run_backtest(df: pd.DataFrame) -> Dict[str, float]:
    sym_cfg = cfg_mod.load()["symbols"]["btcusd"]
    point = float(sym_cfg["point_size"])
    spread_pts = float(sym_cfg["spread_points"])
    slip_pts = float(sym_cfg["slippage_points"])
    comm_rt_per_lot = float(sym_cfg["commission_per_lot"])
    contract_size = float(sym_cfg.get("contract_size") or 1.0)

    price = df["close"].values
    high = df["high"].values
    low = df["low"].values
    open_ = df["open"].values
    vol = df["volume"].values.astype(float)
    n = len(df)

    tema = _tema(price, TEMA_LENGTH)
    lsma = _linreg_end(price, LSMA_LENGTH)
    ema100 = _ema(price, EMA100_LENGTH)
    atr = _atr(high, low, price, 14)
    rsi14 = _rsi(price, 14)
    vol_ma = _sma(vol, VOL_LENGTH)

    vwap = _session_vwap_dayUTC(df)

    davin_ma1 = _sma(price, DAVIN_MA_LONG)
    davin_ma2 = _sma(price, DAVIN_MA_SHORT)
    davin_high52 = pd.Series(high).rolling(52, min_periods=52).max().to_numpy()
    davin_overall = ((davin_high52 - price) / np.where(davin_high52 == 0, np.nan, davin_high52)) * 100.0

    dyn_hi = pd.Series(high).rolling(INST_SWING_LB, min_periods=INST_SWING_LB).max().to_numpy()
    dyn_lo = pd.Series(low).rolling(INST_SWING_LB, min_periods=INST_SWING_LB).min().to_numpy()
    dyn_buy_lo = dyn_lo
    dyn_buy_hi = dyn_lo + atr * INST_ZONE_ATR_W
    dyn_sell_hi = dyn_hi
    dyn_sell_lo = dyn_hi - atr * INST_ZONE_ATR_W
    dyn_mid = np.where(USE_VWAP_MID, vwap, (dyn_hi + dyn_lo) / 2.0)
    dyn_mid_lo = dyn_mid - atr * INST_MID_ATR_BUF
    dyn_mid_hi = dyn_mid + atr * INST_MID_ATR_BUF
    dyn_range_w = atr * INST_ZONE_ATR_W

    rsi_rev = _rsi(price, RSI_LEN)
    stoch_k, stoch_d = _stoch_k_d(high, low, price)
    rsi1 = _rsi(price, 14)
    rsi_low14 = pd.Series(rsi1).rolling(14, min_periods=14).min().to_numpy()
    rsi_high14 = pd.Series(rsi1).rolling(14, min_periods=14).max().to_numpy()
    stoch_rsi = (rsi1 - rsi_low14) / np.where(rsi_high14 == rsi_low14, np.nan, rsi_high14 - rsi_low14) * 100.0

    macd_line, signal_line, _hist = _macd(price)
    adx, plus_di, minus_di = _adx_di(high, low, price, ADX_LEN)
    williams = _williams_r(high, low, price, WILL_LEN)
    # Pine `request.security(..., Williams HTF)` — not used in signal math here; omitting
    # sub-bar resample avoids invalid upsampling on H1/D1 bars.
    cci = (price - _sma(price, 14)) / (0.015 * pd.Series(price).rolling(14, min_periods=14).std().to_numpy())
    kama_rev = _ema(price, KAMA_LEN_REV)
    kama_rise = np.concatenate([[False], kama_rev[1:] > kama_rev[:-1]])
    kama_fall = np.concatenate([[False], kama_rev[1:] < kama_rev[:-1]])
    vol_ma_rev = _sma(vol, VOL_LENGTH)

    adaptive_lb = 10 if INSTRUMENT_TYPE == "BITCOIN" else PIVOT_LOOKBACK

    ph = _pivothigh(high, adaptive_lb, adaptive_lb)
    pl = _pivotlow(low, adaptive_lb, adaptive_lb)

    choch_hi = _pivothigh(high, 3, 3)
    choch_lo = _pivotlow(low, 3, 3)

    warm = max(
        EMA100_LENGTH + 5,
        DAVIN_MA_LONG + 5,
        INST_SWING_LB + 5,
        adaptive_lb * 2 + 5,
        300,
    )

    position = 0  # 1 long, -1 short, 0 flat
    entry_i = -1
    entry_px = 0.0
    entry_sig = ""
    contracts = 0.0
    run_trail_peak = 0.0
    run_trail_lo = float("nan")

    last_pivot_high = np.nan
    last_pivot_low = np.nan
    last_bull_bos = np.nan
    last_bear_bos = np.nan
    ema100_test_count = 0
    last_test_price = np.nan
    test_bar_index = -1

    trend_bars = 0
    current_trend_bullish = False
    trend_start_price = 0.0

    choch_swing_high = np.nan
    choch_swing_low = np.nan
    liq_hi = np.nan
    liq_lo = np.nan

    davin_buy_price = 0.0

    trades: List[Trade] = []
    equity = 100_000.0

    gross_wins = 0.0
    gross_losses = 0.0
    net_pnl = 0.0

    def costs_roundtrip(qty_units: float, px: float) -> float:
        """Spread+slippage modeled as cash per round-trip open+close on notional."""
        half_spread_px = (spread_pts * point) / 2.0
        slip_px = slip_pts * point
        rt_comm = comm_rt_per_lot * (qty_units / contract_size)
        per_side_px = half_spread_px + slip_px
        notional = qty_units * px
        frict = (per_side_px * qty_units) * 2.0 + rt_comm
        return float(frict)

    for i in range(warm, n):
        o = open_[i]
        h = high[i]
        ll = low[i]
        c = price[i]
        v = vol[i]
        atr_i = atr[i]
        ema_i = ema100[i]

        # update pivots
        if not math.isnan(ph[i]):
            last_pivot_high = ph[i]
        if not math.isnan(pl[i]):
            last_pivot_low = pl[i]

        if not math.isnan(choch_hi[i]):
            choch_swing_high = high[i - 3]
        if not math.isnan(choch_lo[i]):
            choch_swing_low = low[i - 3]
        if not math.isnan(choch_hi[i]):
            liq_hi = np.nanmax(high[i - LIQ_ZONE_BARS + 1 : i + 1])
        if not math.isnan(choch_lo[i]):
            liq_lo = np.nanmin(low[i - LIQ_ZONE_BARS + 1 : i + 1])

        min_sweep = atr_i * MIN_SWEEP_ATR
        liq_sweep_down = (
            not math.isnan(last_pivot_low)
            and ll < last_pivot_low
            and c > high[i - 1]
            and (high[i - 1] - ll) > min_sweep
        )
        liq_sweep_up = (
            not math.isnan(last_pivot_high)
            and h > last_pivot_high
            and c < low[i - 1]
            and (h - low[i - 1]) > min_sweep
        )

        # crossover / crossunder vs ema100
        bullish_bos = price[i - 1] < ema100[i - 1] and c > ema_i
        bearish_bos = price[i - 1] > ema100[i - 1] and c < ema_i

        if bullish_bos:
            last_bull_bos = ema_i
        if bearish_bos:
            last_bear_bos = ema_i

        tol = RETEST_TOLERANCE
        bullish_bos_retest = (
            not math.isnan(last_bull_bos)
            and c < last_bull_bos * (1.0 + tol)
            and c > last_bull_bos * (1.0 - tol)
            and c > o
        )
        bearish_bos_retest = (
            not math.isnan(last_bear_bos)
            and c > last_bear_bos * (1.0 - tol)
            and c < last_bear_bos * (1.0 + tol)
            and c < o
        )

        if abs(c - ema_i) < atr_i * ATR_TEST_PERCENT:
            if math.isnan(last_test_price) or (i != test_bar_index and last_test_price != c):
                ema100_test_count += 1
                last_test_price = c
                test_bar_index = i
        if abs(c - ema_i) > atr_i * 0.5:
            ema100_test_count = 0

        lower_high = (
            not math.isnan(last_pivot_high) and h < last_pivot_high and h > high[i - 1]
        )
        higher_low = not math.isnan(last_pivot_low) and ll > last_pivot_low and ll < low[i - 1]

        zone_score = (
            ((c - tema[i]) / tema[i] * 100.0)
            + ((c - lsma[i]) / lsma[i] * 100.0)
            + ((c - ema_i) / ema_i * 100.0)
        ) / 3.0
        zt1, zt2 = 5.0, 2.5  # BITCOIN thresholds
        if zone_score <= -zt1:
            zone = "EXTREME_OVERSOLD"
        elif zone_score <= -zt2:
            zone = "OVERSOLD"
        elif zone_score <= 0.5:
            zone = "NEUTRAL_LOW"
        elif zone_score <= 1.5:
            zone = "NEUTRAL_HIGH"
        elif zone_score <= zt2:
            zone = "OVERBOUGHT"
        else:
            zone = "EXTREME_OVERBOUGHT"

        is_tema_bull = tema[i] > tema[i - 1]
        is_lsma_bull = lsma[i] > lsma[i - 1]
        is_ema_bull = ema_i > ema100[i - 1]
        all_bull = is_tema_bull and is_lsma_bull and is_ema_bull
        all_bear = (not is_tema_bull) and (not is_lsma_bull) and (not is_ema_bull)

        if REQUIRE_TREND_ALIGNMENT:
            long_allowed = all_bull
            short_allowed = all_bear
        else:
            long_allowed = tema[i] > lsma[i] and c > ema_i
            short_allowed = tema[i] < lsma[i] and c < ema_i

        tema_slope = tema[i] - tema[i - 5]
        lsma_slope = lsma[i] - lsma[i - 10]
        ema100_slope = ema_i - ema100[i - 20]
        trend_strength = (tema_slope + lsma_slope + ema100_slope) / 3.0
        norm_strength = abs(trend_strength) / atr_i if atr_i > 0 else 0.0

        if i == warm:
            trend_bars = 0
            current_trend_bullish = False
            trend_start_price = 0.0
        else:
            if all_bull and (not current_trend_bullish or trend_start_price == 0.0):
                trend_bars = 1
                current_trend_bullish = True
                trend_start_price = c
            elif all_bear and (current_trend_bullish or trend_start_price == 0.0):
                trend_bars = 1
                current_trend_bullish = False
                trend_start_price = c
            elif (current_trend_bullish and all_bull) or ((not current_trend_bullish) and all_bear):
                trend_bars += 1
            else:
                trend_bars = 0
                current_trend_bullish = False
                trend_start_price = 0.0

        trend_exhausted = False
        if trend_bars > 0 and trend_start_price > 0.0:
            cond1 = trend_bars > MIN_TREND_BARS * 2
            cond2 = norm_strength < TREND_STRENGTH_THRESHOLD
            cond3 = (current_trend_bullish and not all_bull) or (
                (not current_trend_bullish) and not all_bear
            )
            rsi_div = False
            if MOMENTUM_DIVERGENCE:
                if current_trend_bullish:
                    rsi_div = c > price[i - 10] and rsi14[i] < rsi14[i - 10]
                else:
                    rsi_div = c < price[i - 10] and rsi14[i] > rsi14[i - 10]
            trend_exhausted = cond1 and (cond2 or cond3 or rsi_div)

        volume_ok = v > vol_ma[i] * MIN_VOL_MULT
        tema_x_up = tema[i - 1] <= lsma[i - 1] and tema[i] > lsma[i]
        tema_x_dn = tema[i - 1] >= lsma[i - 1] and tema[i] < lsma[i]

        rsi_bear = rsi_rev[i] < 50
        stoch_bear = stoch_k[i] < 50 or stoch_k[i] < stoch_d[i]
        stochrsi_bear = stoch_rsi[i] < 50
        macd_bear = macd_line[i] < signal_line[i]
        will_bear = williams[i] < -50
        cci_bear = cci[i] < 0
        bear_score = (
            float(rsi_bear)
            + float(stoch_bear)
            + float(stochrsi_bear)
            + float(macd_bear)
            + float(will_bear)
            + float(cci_bear)
        )
        strong_bear = bear_score >= 3.0

        rsi_bull = rsi_rev[i] > 50
        stoch_bull = stoch_k[i] > 50 or stoch_k[i] > stoch_d[i]
        stochrsi_bull = stoch_rsi[i] > 50
        macd_bull = macd_line[i] > signal_line[i]
        will_bull = williams[i] > -50
        cci_bull = cci[i] > 0
        bull_score = (
            float(rsi_bull)
            + float(stoch_bull)
            + float(stochrsi_bull)
            + float(macd_bull)
            + float(will_bull)
            + float(cci_bull)
        )
        strong_bull = bull_score >= 3.0

        long_trend_rev = c > kama_rev[i] and kama_rise[i] and (
            adx[i] > ADX_STRONG or plus_di[i] > minus_di[i]
        )
        short_trend_rev = c < kama_rev[i] and kama_fall[i] and (
            adx[i] > ADX_STRONG or minus_di[i] > plus_di[i]
        )
        volume_ok_rev = v > vol_ma_rev[i] * MIN_VOL_MULT_REV

        reversal_long = ENABLE_REVERSALS and long_trend_rev and strong_bull and volume_ok_rev
        reversal_short = ENABLE_REVERSALS and short_trend_rev and strong_bear and volume_ok_rev

        ideal_action = "WAIT"
        ideal_scenario = "WAIT"
        if USE_IDEAL:
            if liq_sweep_down and c > ema_i and volume_ok:
                ideal_scenario = "IDEAL B2"
                ideal_action = "BUY"
            elif bullish_bos_retest and tema[i] > lsma[i] and volume_ok:
                ideal_scenario = "IDEAL B3"
                ideal_action = "BUY"
            elif (
                (zone == "EXTREME_OVERSOLD" or zone == "OVERSOLD")
                and c > ema_i
                and tema[i] > lsma[i]
                and volume_ok
            ):
                ideal_scenario = "IDEAL B4"
                ideal_action = "BUY"
            if bearish_bos_retest and tema[i] < lsma[i] and volume_ok:
                ideal_scenario = "IDEAL S1"
                ideal_action = "SELL"
            elif lower_high and (zone == "OVERBOUGHT" or zone == "EXTREME_OVERBOUGHT") and tema[i] < lsma[i]:
                ideal_scenario = "IDEAL S2"
                ideal_action = "SELL"
            elif (
                ema100_test_count >= MAX_TEST_COUNT
                and c < ema_i
                and tema[i] < lsma[i]
                and c < ema_i
                and price[i - 1] >= ema100[i - 1]
            ):
                ideal_scenario = "IDEAL S4"
                ideal_action = "SELL"

        inst_action = "WAIT"
        inst_size = INST_BASE_SIZE
        if dyn_buy_lo[i] <= c <= dyn_buy_hi[i]:
            inst_action = "ACCUMULATE"
            if INST_SCALE and dyn_range_w[i] > 0:
                inst_size = INST_BASE_SIZE * (1.0 + (dyn_buy_hi[i] - c) / dyn_range_w[i])
        elif dyn_sell_lo[i] <= c <= dyn_sell_hi[i]:
            inst_action = "DISTRIBUTE"
            if INST_SCALE and dyn_range_w[i] > 0:
                inst_size = INST_BASE_SIZE * (1.0 + (c - dyn_sell_lo[i]) / dyn_range_w[i])
        elif dyn_mid_lo[i] <= c <= dyn_mid_hi[i]:
            inst_action = "PROVIDE_LIQUIDITY"

        inst_long = USE_INSTITUTIONAL and inst_action == "ACCUMULATE"
        inst_short = USE_INSTITUTIONAL and inst_action == "DISTRIBUTE"

        davin_sell_cond = USE_DAVIN and (
            c > davin_ma2[i] and position > 0 and (not DAVIN_LOWER_CLOSE or c < low[i - 1])
        )
        davin_stop_dist = ((davin_buy_price - c) / c) if position > 0 else 0.0
        davin_stop_cond = position > 0 and davin_stop_dist > 0.15

        trail_offset = atr_i * TRAIL_ATR_MULT

        # --- exits before new entries (aligns with Pine order_on_close semantics)
        if position != 0 and entry_i >= 0:
            bars_in = i - entry_i
            if position > 0:
                if entry_sig == "INSTITUTIONAL":
                    long_sl = entry_px - STOP_LOSS_ATR_MULT * 1.5 * atr_i
                    long_tp = entry_px + TAKE_PROFIT_ATR_MULT * 1.2 * atr_i
                else:
                    long_sl = entry_px - STOP_LOSS_ATR_MULT * atr_i
                    long_tp = entry_px + TAKE_PROFIT_ATR_MULT * atr_i
                run_trail_peak = max(run_trail_peak, h)
                trail_stop = run_trail_peak - trail_offset
                stop_px = max(long_sl, trail_stop)

                exit_px = None
                if ll <= stop_px:
                    exit_px = float(stop_px)
                elif h >= long_tp:
                    exit_px = float(long_tp)
                elif bars_in >= MAX_BARS_IN_TRADE:
                    exit_px = float(c)
                elif USE_DAVIN and (davin_sell_cond or davin_stop_cond):
                    exit_px = float(c)
                if exit_px is not None:
                    qty = contracts
                    pnl_g = (exit_px - entry_px) * qty
                    costs = costs_roundtrip(qty, entry_px)
                    net = pnl_g - costs
                    gross_wins += max(pnl_g, 0.0)
                    gross_losses += max(-pnl_g, 0.0)
                    net_pnl += net
                    equity += net
                    trades.append(
                        Trade(
                            "long",
                            entry_i,
                            i,
                            entry_px,
                            exit_px,
                            pnl_g,
                            costs,
                        )
                    )
                    position = 0
                    entry_i = -1
                    contracts = 0.0
                    entry_sig = ""
                    run_trail_peak = 0.0
                    run_trail_lo = float("nan")

            elif position < 0:
                if entry_sig == "INSTITUTIONAL":
                    short_sl = entry_px + STOP_LOSS_ATR_MULT * 1.5 * atr_i
                    short_tp = entry_px - TAKE_PROFIT_ATR_MULT * 1.2 * atr_i
                else:
                    short_sl = entry_px + STOP_LOSS_ATR_MULT * atr_i
                    short_tp = entry_px - TAKE_PROFIT_ATR_MULT * atr_i
                if math.isnan(run_trail_lo):
                    run_trail_lo = ll
                else:
                    run_trail_lo = min(run_trail_lo, ll)
                trail_stop = run_trail_lo + trail_offset
                stop_px = min(short_sl, trail_stop)

                exit_px = None
                if h >= stop_px:
                    exit_px = float(stop_px)
                elif ll <= short_tp:
                    exit_px = float(short_tp)
                elif bars_in >= MAX_BARS_IN_TRADE:
                    exit_px = float(c)
                if exit_px is not None:
                    qty = contracts
                    pnl_g = (entry_px - exit_px) * qty
                    costs = costs_roundtrip(qty, entry_px)
                    net = pnl_g - costs
                    gross_wins += max(pnl_g, 0.0)
                    gross_losses += max(-pnl_g, 0.0)
                    net_pnl += net
                    equity += net
                    trades.append(
                        Trade("short", entry_i, i, entry_px, exit_px, pnl_g, costs)
                    )
                    position = 0
                    entry_i = -1
                    contracts = 0.0
                    entry_sig = ""
                    run_trail_peak = 0.0
                    run_trail_lo = float("nan")

        flat = position == 0

        davin_buy_cond = False
        if USE_DAVIN:
            davin_buy_cond = (
                (c > davin_ma1[i] and c < davin_ma2[i] and flat)
                or (flat and DAVIN_BUY_DIP and davin_overall[i] > DAVIN_DIP_TRIGGER)
            )

        long_condition = False
        short_condition = False
        active_scenario = ""
        sig_src = ""

        if USE_INSTITUTIONAL and inst_long:
            long_condition = True
            active_scenario = "INST LONG"
            sig_src = "INSTITUTIONAL"
        elif USE_INSTITUTIONAL and inst_short:
            short_condition = True
            active_scenario = "INST SHORT"
            sig_src = "INSTITUTIONAL"
        elif USE_IDEAL and ideal_action == "BUY" and flat:
            long_condition = True
            active_scenario = ideal_scenario
            sig_src = "IDEAL"
        elif USE_IDEAL and ideal_action == "SELL" and flat:
            short_condition = True
            active_scenario = ideal_scenario
            sig_src = "IDEAL"
        elif ENABLE_REVERSALS and reversal_long and flat:
            long_condition = True
            active_scenario = "REV LONG"
            sig_src = "REVERSAL"
        elif ENABLE_REVERSALS and reversal_short and flat:
            short_condition = True
            active_scenario = "REV SHORT"
            sig_src = "REVERSAL"
        elif USE_DAVIN and davin_buy_cond and flat:
            long_condition = True
            active_scenario = "DAVIN"
            sig_src = "DAVIN MA"
        else:
            if USE_TREND_EXHAUSTION:
                long_condition = (
                    long_allowed and tema_x_up and volume_ok
                ) or (
                    trend_exhausted and (not current_trend_bullish) and tema_x_up and volume_ok
                )
                short_condition = (
                    short_allowed and tema_x_dn and volume_ok
                ) or (
                    trend_exhausted and current_trend_bullish and tema_x_dn and volume_ok
                )
                active_scenario = "ORIG"
            else:
                long_condition = long_allowed and tema_x_up and volume_ok
                short_condition = short_allowed and tema_x_dn and volume_ok
                active_scenario = "ORIG"
            sig_src = "ORIGINAL" if long_condition or short_condition else ""

        # Davin entry price anchor (previous bar condition on open), simplified to bar open rule
        if USE_DAVIN and i > 0 and (
            (price[i - 1] > davin_ma1[i - 1] and price[i - 1] < davin_ma2[i - 1] and flat)
            or (
                flat
                and DAVIN_BUY_DIP
                and ((davin_high52[i - 1] - price[i - 1]) / davin_high52[i - 1] * 100.0)
                > DAVIN_DIP_TRIGGER
            )
        ):
            davin_buy_price = float(o)

        # Entries at close (flat only)
        pos_size_equiv = position
        if long_condition and pos_size_equiv == 0:
            if sig_src == "INSTITUTIONAL":
                pct = float(inst_size)
            elif sig_src == "IDEAL":
                pct = 15.0
            elif sig_src == "REVERSAL":
                pct = 12.5
            else:
                pct = 10.0
            qty = equity / c * pct / 100.0
            position = 1
            entry_i = i
            entry_px = float(c)
            contracts = qty
            entry_sig = sig_src
            run_trail_peak = h

        elif short_condition and pos_size_equiv == 0:
            if sig_src == "INSTITUTIONAL":
                pct = float(inst_size)
            elif sig_src == "IDEAL":
                pct = 15.0
            elif sig_src == "REVERSAL":
                pct = 12.5
            else:
                pct = 10.0
            qty = equity / c * pct / 100.0
            position = -1
            entry_i = i
            entry_px = float(c)
            contracts = qty
            entry_sig = sig_src
            run_trail_lo = ll

    # Close open position at last bar
    if position != 0 and entry_i >= 0:
        exit_px = float(price[-1])
        qty = contracts
        if position > 0:
            pnl_g = (exit_px - entry_px) * qty
        else:
            pnl_g = (entry_px - exit_px) * qty
        costs = costs_roundtrip(qty, entry_px)
        net = pnl_g - costs
        gross_wins += max(pnl_g, 0.0)
        gross_losses += max(-pnl_g, 0.0)
        net_pnl += net
        trades.append(
            Trade("long" if position > 0 else "short", entry_i, n - 1, entry_px, exit_px, pnl_g, costs)
        )

    pf_gross = (gross_wins / gross_losses) if gross_losses > 0 else float("inf")
    wins = sum(1 for t in trades if t.gross_pnl > 0)
    losses = sum(1 for t in trades if t.gross_pnl <= 0)
    net_wins = sum(max(t.gross_pnl - t.costs, 0.0) for t in trades)
    net_losses = sum(max(-(t.gross_pnl - t.costs), 0.0) for t in trades)
    pf_net = (net_wins / net_losses) if net_losses > 0 else float("inf")

    return {
        "bars": float(n),
        "trades": float(len(trades)),
        "gross_profit": float(gross_wins),
        "gross_loss": float(gross_losses),
        "pf_gross": float(pf_gross),
        "net_pnl": float(net_pnl),
        "pf_net": float(pf_net),
        "win_rate": float(wins / len(trades)) if trades else 0.0,
    }


def main() -> int:
    p = argparse.ArgumentParser(
        description="BTCUSD backtest for ULTIMATE TEMA/LSMA replica (offline Python model)."
    )
    p.add_argument(
        "--tf",
        nargs="+",
        default=["M15", "H1", "D1"],
        help="Timeframes to run (must be loadable via agents.data_fetch.load_ohlcv).",
    )
    args = p.parse_args()

    cfg = cfg_mod.load()
    w = cfg["windows"]
    start, end = w["is_start"], w["is_end"]

    summary: Dict[str, Any] = {}
    for tf in args.tf:
        tf_u = tf.upper()
        df = load_ohlcv("BTCUSD", tf_u, start, end)
        stats = run_backtest(df)
        row = {"timeframe": tf_u, **stats}
        summary[tf_u] = row
        print(f"\n=== BTCUSD {tf_u} ({start} .. {end}) ===")
        print(json.dumps(row, indent=2))
        slug = tf_u.lower().replace("/", "")
        out = Path(__file__).resolve().parent / f"ultimate_tema_lsma_btcusd_{slug}.json"
        out.write_text(json.dumps(row, indent=2))
        print(f"wrote {out}")

    combo = Path(__file__).resolve().parent / "ultimate_tema_lsma_btcusd_tf_compare.json"
    combo.write_text(json.dumps(summary, indent=2))
    print(f"\nwrote {combo}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
