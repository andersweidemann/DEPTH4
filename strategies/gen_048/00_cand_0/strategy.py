from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _donchian_high(data, n):
    arr = signals.donchian(data, n)
    if isinstance(arr, tuple):
        return arr[0]
    return arr[0] if hasattr(arr, "shape") and arr.ndim == 2 else arr


def _donchian_low(data, n):
    arr = signals.donchian(data, n)
    if isinstance(arr, tuple):
        return arr[1]
    return arr[1] if hasattr(arr, "shape") and arr.ndim == 2 else arr


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        try:
            spec_file = Path(__file__).parent / self.spec_path
            if spec_file.exists():
                self._spec = json.loads(spec_file.read_text())
        except Exception:
            pass

        super().init()

        sig_params = self._spec.get("signal", {}).get("params", {})
        reg_params = self._spec.get("regime_filter", {}).get("params", {})

        self._donchian_period = int(sig_params.get("donchian_period", 20))
        self._min_body_atr = float(sig_params.get("min_body_atr", 0.6))
        self._sess_start = sig_params.get("session_utc_start", "07:00")
        self._sess_end = sig_params.get("session_utc_end", "15:00")

        self._adx_period = int(reg_params.get("adx_period", 14))
        self._adx_min = float(reg_params.get("adx_min", 22))
        self._atr_pct_period = int(reg_params.get("atr_percentile_period", 100))
        self._atr_pct_min = float(reg_params.get("atr_percentile_min", 40))

        exit_cfg = self._spec.get("exit", {})
        self._sl_atr_mult = 1.5
        self._tp_atr_mult = 3.0
        self._time_stop_bars = int(exit_cfg.get("time_stop_bars", 24))
        self._trail_atr_mult = 2.5
        self._trail_activate_r = 1.0

        sizing = self._spec.get("sizing", {})
        self._risk_pct = float(sizing.get("risk_pct", 0.75))
        self._max_daily_trades = int(sizing.get("max_daily_trades", 4))

        self._atr_series = self.I(signals.atr, self.data, 14)
        self._don_high = self.I(_donchian_high, self.data, self._donchian_period)
        self._don_low = self.I(_donchian_low, self.data, self._donchian_period)
        self._adx_series = self.I(regime.adx, self.data, self._adx_period)
        self._atr_pct_series = self.I(
            regime.atr_percentile, self.data, 14, self._atr_pct_period
        )

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        ts = pd.DatetimeIndex(idx)
        if ts.tz is None:
            try:
                ts = ts.tz_localize("UTC")
            except Exception:
                pass
        mins = ts.hour * 60 + ts.minute
        sh, sm = [int(x) for x in self._sess_start.split(":")]
        eh, em = [int(x) for x in self._sess_end.split(":")]
        start_m = sh * 60 + sm
        end_m = eh * 60 + em
        self._in_session_mask = np.asarray((mins >= start_m) & (mins < end_m), dtype=bool)

        self._last_entry_bar = -1
        self._day_trades: Dict[str, int] = {}

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 2:
            return False
        adx_val = float(self._adx_series[-1])
        atr_pct = float(self._atr_pct_series[-1])
        if np.isnan(adx_val) or np.isnan(atr_pct):
            return False
        if adx_val < self._adx_min:
            return False
        if atr_pct < self._atr_pct_min:
            return False
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if 0 <= bar_i < len(self._in_session_mask):
            if not bool(self._in_session_mask[bar_i]):
                return False
        day = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        cnt = self._day_trades.get(day, 0)
        if cnt >= self._max_daily_trades:
            return False
        try:
            dd_kill = self._spec.get("risk", {}).get(
                "daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"]
            )
            if not risk.daily_kill_ok(self._kill_state, day, self.equity, dd_kill):
                return False
        except Exception:
            pass
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i == self._last_entry_bar:
            return
        if len(self._don_high) < 2 or len(self._atr_series) < 1:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        atr_val = float(self._atr_series[-1])
        if np.isnan(atr_val) or atr_val <= 0:
            return

        prev_dh = float(self._don_high[-2])
        prev_dl = float(self._don_low[-2])
        body = abs(close - open_)
        if body < self._min_body_atr * atr_val:
            return

        long_sig = close > prev_dh
        short_sig = close < prev_dl
        if not (long_sig or short_sig):
            return

        sl_dist = self._sl_atr_mult * atr_val
        if sl_dist <= 0:
            return

        if long_sig:
            sl = close - sl_dist
            tp = close + self._tp_atr_mult * atr_val
        else:
            sl = close + sl_dist
            tp = close - self._tp_atr_mult * atr_val

        try:
            units = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                entry=close,
                sl=sl,
                symbol=self._symbol,
            )
        except Exception:
            units = 0
        if not units or units <= 0:
            size_frac = min(0.99, max(0.01, self._risk_pct / 100.0 * 10))
            size = size_frac
        else:
            size = units

        self.sl_price = sl
        self.tp_price = tp

        try:
            if long_sig:
                self.buy(size=size, sl=sl, tp=tp)
            else:
                self.sell(size=size, sl=sl, tp=tp)
            self._last_entry_bar = bar_i
            day = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
            self._day_trades[day] = self._day_trades.get(day, 0) + 1
        except Exception:
            pass

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return

        if self._time_stop_bars is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self._time_stop_bars:
                self.position.close()
                return

        if len(self._atr_series) < 1:
            return
        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now):
            return
        price = float(self.data.Close[-1])

        for trade in self.trades:
            entry = trade.entry_price
            r_dist = self._sl_atr_mult * atr_now
            if r_dist <= 0:
                continue
            if trade.is_long:
                profit = price - entry
                if profit >= self._trail_activate_r * r_dist:
                    new_sl = price - self._trail_atr_mult * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                profit = entry - price
                if profit >= self._trail_activate_r * r_dist:
                    new_sl = price + self._trail_atr_mult * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl

    def next(self):
        self._manage_open()
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return
        self._enter_if_signal()