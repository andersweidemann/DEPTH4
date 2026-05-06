from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _donchian_high(data, n):
    high = np.asarray(data.High, dtype=float)
    out = np.full_like(high, np.nan)
    for i in range(n, len(high)):
        out[i] = np.max(high[i - n:i])
    return out


def _donchian_low(data, n):
    low = np.asarray(data.Low, dtype=float)
    out = np.full_like(low, np.nan)
    for i in range(n, len(low)):
        out[i] = np.min(low[i - n:i])
    return out


def _adx_arr(data, n):
    df = data.df if hasattr(data, "df") else pd.DataFrame(
        {"High": data.High, "Low": data.Low, "Close": data.Close}
    )
    return np.asarray(regime.adx(df, n), dtype=float)


def _atr_pct_arr(data, atr_period, lookback):
    df = data.df if hasattr(data, "df") else pd.DataFrame(
        {"High": data.High, "Low": data.Low, "Close": data.Close}
    )
    return np.asarray(regime.atr_percentile(df, atr_period, lookback), dtype=float)


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        spec_file = os.path.join(os.path.dirname(__file__), self.spec_path)
        try:
            with open(spec_file, "r") as f:
                self._spec = json.load(f)
        except Exception:
            self._spec = {}

        super().init()

        self._donchian_period = 20
        self._adx_period = 14
        self._atr_period = 14
        self._atr_pct_lookback = 500
        self._ema_period = 200
        self._adx_min = 22.0
        self._atr_pct_min = 40.0
        self._sl_atr_mult = 2.0
        self._rr = 2.5
        self._time_stop_bars = 48
        self._trail_atr_mult = 2.0
        self._trail_activate_r = 1.0
        self._be_after_r = 1.0
        self._cooldown_bars = 4
        self._risk_pct = 0.5
        self._max_lot = 3.0
        self._min_lot = 0.1

        self._session_start = "07:00"
        self._session_end = "15:30"

        self._donch_high = self.I(_donchian_high, self.data, self._donchian_period)
        self._donch_low = self.I(_donchian_low, self.data, self._donchian_period)
        self._atr_series = self.I(signals.atr, self.data, self._atr_period)
        self._ema_series = self.I(signals.ema, self.data.Close, self._ema_period)
        self._adx_series = self.I(_adx_arr, self.data, self._adx_period)
        self._atr_pct_series = self.I(
            _atr_pct_arr, self.data, self._atr_period, self._atr_pct_lookback
        )

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        sess_list = [{"start": self._session_start, "end": self._session_end}]
        try:
            self._session_mask_full = np.asarray(
                signals.session_mask(idx, sess_list), dtype=bool
            )
        except Exception:
            try:
                self._session_mask_full = np.asarray(
                    signals.session_mask(idx, self._session_start, self._session_end),
                    dtype=bool,
                )
            except Exception:
                self._session_mask_full = np.ones(len(idx), dtype=bool)

        self._last_entry_bar = -10_000
        self._be_moved: Dict[int, bool] = {}
        self._trail_active: Dict[int, bool] = {}

    def _session_active(self) -> bool:
        mask = self._session_mask_full
        i = len(self.data) - 1
        if mask is None or i < 0 or i >= len(mask):
            return True
        return bool(mask[i])

    def _filters_ok(self) -> bool:
        if not self._session_active():
            return False
        try:
            now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
            dd_kill = self.spec.get("risk", {}).get(
                "daily_dd_kill_pct",
                config.load().get("risk", {}).get("daily_dd_kill_pct", 0.05),
            )
            if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
                return False
        except Exception:
            pass
        return True

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 2 or len(self._atr_pct_series) < 2:
            return False
        adx_v = float(self._adx_series[-1])
        atrp = float(self._atr_pct_series[-1])
        if np.isnan(adx_v) or np.isnan(atrp):
            return False
        if adx_v < self._adx_min:
            return False
        if atrp < self._atr_pct_min:
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self._cooldown_bars:
            return

        if len(self._donch_high) < 3:
            return

        close = float(self.data.Close[-1])
        dh_prev = float(self._donch_high[-2])
        dl_prev = float(self._donch_low[-2])
        ema_v = float(self._ema_series[-1])
        atr_v = float(self._atr_series[-1])

        if np.isnan(dh_prev) or np.isnan(dl_prev) or np.isnan(ema_v) or np.isnan(atr_v):
            return
        if atr_v <= 0:
            return

        long_sig = close > dh_prev and close > ema_v
        short_sig = close < dl_prev and close < ema_v

        if not (long_sig or short_sig):
            return

        equity = float(self.equity)
        if long_sig:
            sl = close - self._sl_atr_mult * atr_v
            tp = close + self._sl_atr_mult * atr_v * self._rr
            stop_dist = close - sl
        else:
            sl = close + self._sl_atr_mult * atr_v
            tp = close - self._sl_atr_mult * atr_v * self._rr
            stop_dist = sl - close

        if stop_dist <= 0:
            return

        try:
            lots = risk.lots_by_risk_pct(
                equity=equity,
                risk_pct=self._risk_pct,
                stop_distance=stop_dist,
                price=close,
                symbol=self._symbol,
            )
        except TypeError:
            try:
                lots = risk.lots_by_risk_pct(
                    equity, self._risk_pct, stop_dist, close, self._symbol
                )
            except Exception:
                lots = (equity * (self._risk_pct / 100.0)) / max(stop_dist, 1e-9)

        lots = float(lots) if lots else 0.0
        if lots <= 0:
            return
        lots = max(self._min_lot, min(self._max_lot, lots))

        size_units = max(1, int(round(lots)))

        self.sl_price = sl
        self.tp_price = tp

        if long_sig:
            self.buy(size=size_units, sl=sl, tp=tp)
        else:
            self.sell(size=size_units, sl=sl, tp=tp)

        self._last_entry_bar = bar_i

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return

        price = float(self.data.Close[-1])
        atr_v = float(self._atr_series[-1]) if len(self._atr_series) else np.nan

        bar_i = len(self.data) - 1
        for trade in self.trades:
            bars_open = bar_i - trade.entry_bar
            if self._time_stop_bars is not None and bars_open >= self._time_stop_bars:
                trade.close()
                continue

            entry = float(trade.entry_price)
            sl0 = trade.sl
            if sl0 is None or np.isnan(atr_v):
                continue

            if trade.is_long:
                r_dist = entry - (entry - self._sl_atr_mult * atr_v)
                if r_dist <= 0:
                    continue
                r_now = (price - entry) / r_dist
                if r_now >= self._be_after_r and not self._be_moved.get(id(trade), False):
                    if trade.sl is None or entry > trade.sl:
                        trade.sl = entry
                    self._be_moved[id(trade)] = True
                if r_now >= self._trail_activate_r:
                    new_sl = price - self._trail_atr_mult * atr_v
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                r_dist = (entry + self._sl_atr_mult * atr_v) - entry
                if r_dist <= 0:
                    continue
                r_now = (entry - price) / r_dist
                if r_now >= self._be_after_r and not self._be_moved.get(id(trade), False):
                    if trade.sl is None or entry < trade.sl:
                        trade.sl = entry
                    self._be_moved[id(trade)] = True
                if r_now >= self._trail_activate_r:
                    new_sl = price + self._trail_atr_mult * atr_v
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()