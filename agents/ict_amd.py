"""
Bar-by-bar replica of the Pine v6 script "ICT Full Stacks — AMD · Sweep · CHoCH · FVG".

Rolling extrema use ``rolling(...).shift(1)`` to match ``ta.highest(...)[1]`` /
``ta.lowest(...)[1]`` on confirmed bars.

Not guaranteed identical to TradingView (sessions, partial fills, ``na``).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals


@dataclass
class ICTAMDParams:
    range_len: int = 20
    atr_len: int = 14
    retest_mult: float = 1.0
    retest_bars: int = 50
    reset_on_new: bool = True
    enable_fvg: bool = True
    fvg_min_pct: float = 0.01
    rr_ratio: float = 2.0
    sl_mult: float = 1.0
    max_bars: int = 50
    cooldown: int = 3
    rsi_len: int = 14
    rsi_ob: int = 75
    rsi_os: int = 25


def simulate_ict_amd(
    df: pd.DataFrame,
    params: Optional[ICTAMDParams] = None,
) -> Dict[str, Any]:
    """Return entry marker arrays length ``n`` aligned with ``df`` (Open/High/Low/Close)."""
    p = params or ICTAMDParams()
    n = len(df)
    h = df["High"].to_numpy(dtype=float)
    l = df["Low"].to_numpy(dtype=float)
    c = df["Close"].to_numpy(dtype=float)

    class _D:
        pass

    d = _D()
    d.Open = df["Open"].to_numpy(dtype=float)
    d.High, d.Low, d.Close = h, l, c
    atr = signals.atr(d, p.atr_len)
    rsi = signals.rsi(d, p.rsi_len)

    roll_h = pd.Series(h).rolling(p.range_len).max().shift(1).to_numpy()
    roll_l = pd.Series(l).rolling(p.range_len).min().shift(1).to_numpy()

    long_entry = np.zeros(n, dtype=bool)
    short_entry = np.zeros(n, dtype=bool)
    long_sl = np.full(n, np.nan)
    long_tp = np.full(n, np.nan)
    short_sl = np.full(n, np.nan)
    short_tp = np.full(n, np.nan)

    g_in_trade = False
    g_is_long = False
    g_tp_v = np.nan
    g_sl_v = np.nan
    last_sig_bar = -10_000
    entry_bar = 0

    b_phase = 0
    b_range_h = np.nan
    b_range_l = np.nan
    b_manip_low = np.nan
    b_manip_bar = 0
    b_broken_r = np.nan
    b_choch_bar = 0
    b_fvg_top = np.nan
    b_fvg_bot = np.nan

    s_phase = 0
    s_range_h = np.nan
    s_range_l = np.nan
    s_manip_hi = np.nan
    s_manip_bar = 0
    s_broken_s = np.nan
    s_choch_bar = 0
    s_fvg_top = np.nan
    s_fvg_bot = np.nan

    def fvg_min_size(ci: float) -> float:
        return abs(ci) * p.fvg_min_pct / 100.0

    for i in range(n):
        prev_l = roll_l[i]
        prev_h = roll_h[i]
        atr_i = float(atr[i]) if i < len(atr) and not np.isnan(atr[i]) else np.nan
        rsi_i = float(rsi[i]) if i < len(rsi) and not np.isnan(rsi[i]) else np.nan

        if g_in_trade and not (np.isnan(g_tp_v) or np.isnan(g_sl_v)):
            tp_hit = (g_is_long and h[i] >= g_tp_v) or ((not g_is_long) and l[i] <= g_tp_v)
            sl_hit = (g_is_long and l[i] <= g_sl_v) or ((not g_is_long) and h[i] >= g_sl_v)
            time_exit = (i - entry_bar) >= p.max_bars
            if tp_hit or sl_hit or time_exit:
                g_in_trade = False

        buy_signal = False
        sell_signal = False
        cd_ok = (i - last_sig_bar) >= p.cooldown
        ready = (not g_in_trade) and cd_ok

        if (b_phase == 0 or (b_phase == 1 and p.reset_on_new)) and not np.isnan(prev_l):
            if l[i] < prev_l and c[i] > prev_l:
                b_phase = 1
                b_range_h = prev_h
                b_range_l = prev_l
                b_manip_low = l[i]
                b_manip_bar = i
                b_broken_r = np.nan
                b_choch_bar = 0
                b_fvg_top = np.nan
                b_fvg_bot = np.nan

        if b_phase == 1 and not np.isnan(b_range_h) and not np.isnan(atr_i):
            if c[i] < b_manip_low - atr_i * 3.0:
                b_phase = 0
            elif c[i] > b_range_h:
                b_phase = 2
                b_broken_r = b_range_h
                b_choch_bar = i

        if b_phase == 2 and not np.isnan(atr_i):
            if p.enable_fvg and np.isnan(b_fvg_top) and i >= 2:
                fmin = fvg_min_size(c[i])
                if l[i] > h[i - 2] and (l[i] - h[i - 2]) >= fmin:
                    b_fvg_top = l[i]
                    b_fvg_bot = h[i - 2]
            if (i - b_choch_bar) > p.retest_bars:
                b_phase = 0
                b_fvg_top = np.nan
                b_fvg_bot = np.nan

        if (s_phase == 0 or (s_phase == 1 and p.reset_on_new)) and not np.isnan(prev_h):
            if h[i] > prev_h and c[i] < prev_h:
                s_phase = 1
                s_range_h = prev_h
                s_range_l = prev_l
                s_manip_hi = h[i]
                s_manip_bar = i
                s_broken_s = np.nan
                s_choch_bar = 0
                s_fvg_top = np.nan
                s_fvg_bot = np.nan

        if s_phase == 1 and not np.isnan(s_range_l) and not np.isnan(atr_i):
            if c[i] > s_manip_hi + atr_i * 3.0:
                s_phase = 0
            elif c[i] < s_range_l:
                s_phase = 2
                s_broken_s = s_range_l
                s_choch_bar = i

        if s_phase == 2 and not np.isnan(atr_i):
            if p.enable_fvg and np.isnan(s_fvg_top) and i >= 2:
                fmin = fvg_min_size(c[i])
                if h[i] < l[i - 2] and (l[i - 2] - h[i]) >= fmin:
                    s_fvg_top = l[i - 2]
                    s_fvg_bot = h[i]
            if (i - s_choch_bar) > p.retest_bars:
                s_phase = 0
                s_fvg_top = np.nan
                s_fvg_bot = np.nan

        if ready and b_phase == 2 and not np.isnan(atr_i) and not np.isnan(rsi_i):
            zone_top = b_broken_r + atr_i * p.retest_mult
            zone_bot = b_broken_r - atr_i * p.retest_mult
            rsi_ok = rsi_i < p.rsi_ob
            above_m = c[i] > b_manip_low
            if p.enable_fvg and not np.isnan(b_fvg_top) and not np.isnan(b_fvg_bot) \
                    and rsi_ok and above_m:
                if l[i] <= b_fvg_top and h[i] >= b_fvg_bot:
                    buy_signal = True
                    b_phase = 0
                    b_fvg_top = np.nan
                    b_fvg_bot = np.nan
            if not buy_signal and not np.isnan(b_broken_r) and rsi_ok and above_m:
                if l[i] <= zone_top and l[i] >= zone_bot:
                    buy_signal = True
                    b_phase = 0

        if ready and s_phase == 2 and not buy_signal and not np.isnan(atr_i) \
                and not np.isnan(rsi_i):
            zone_top = s_broken_s + atr_i * p.retest_mult
            zone_bot = s_broken_s - atr_i * p.retest_mult
            rsi_ok = rsi_i > p.rsi_os
            below_m = c[i] < s_manip_hi
            if p.enable_fvg and not np.isnan(s_fvg_top) and not np.isnan(s_fvg_bot) \
                    and rsi_ok and below_m:
                if l[i] <= s_fvg_top and h[i] >= s_fvg_bot:
                    sell_signal = True
                    s_phase = 0
                    s_fvg_top = np.nan
                    s_fvg_bot = np.nan
            if not sell_signal and not np.isnan(s_broken_s) and rsi_ok and below_m:
                if h[i] >= zone_bot and h[i] <= zone_top:
                    sell_signal = True
                    s_phase = 0

        if buy_signal and not g_in_trade:
            g_in_trade = True
            g_is_long = True
            entry_bar = i
            last_sig_bar = i
            sl_level = float(b_manip_low - atr_i * p.sl_mult)
            sl_dist = max(abs(float(c[i]) - sl_level), atr_i * 0.1)
            tp_level = float(c[i] + sl_dist * p.rr_ratio)
            g_tp_v = tp_level
            g_sl_v = sl_level
            long_entry[i] = True
            long_sl[i] = sl_level
            long_tp[i] = tp_level

        if sell_signal and not g_in_trade:
            g_in_trade = True
            g_is_long = False
            entry_bar = i
            last_sig_bar = i
            sl_level = float(s_manip_hi + atr_i * p.sl_mult)
            sl_dist = max(abs(sl_level - float(c[i])), atr_i * 0.1)
            tp_level = float(c[i] - sl_dist * p.rr_ratio)
            g_tp_v = tp_level
            g_sl_v = sl_level
            short_entry[i] = True
            short_sl[i] = sl_level
            short_tp[i] = tp_level

    return {
        "long_entry": long_entry,
        "long_sl": long_sl,
        "long_tp": long_tp,
        "short_entry": short_entry,
        "short_sl": short_sl,
        "short_tp": short_tp,
    }
