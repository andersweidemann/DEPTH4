import json
import os
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        super().init()
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                with open(spec_file, "r") as f:
                    self.spec = json.load(f)
            except Exception:
                pass

        sig = self.spec.get("signals", {})
        donch_period = sig.get("donchian", {}).get("period", 40)
        ema_fast_p = sig.get("ema_fast", {}).get("period", 20)
        ema_slow_p = sig.get("ema_slow", {}).get("period", 50)
        atr_p = sig.get("atr", {}).get("period", 14)
        adx_p = sig.get("adx", {}).get("period", 14)

        self._donch = self.I(signals.donchian, self.data, donch_period)
        self._ema_fast = self.I(signals.ema, self.data.Close, ema_fast_p)
        self._ema_slow = self.I(signals.ema, self.data.Close, ema_slow_p)
        self._atr_series = self.I(signals.atr, self.data, atr_p)
        self._adx_series = self.I(regime.adx, self.data, adx_p)
        self._atr_pct = self.I(regime.atr_percentile, self.data, 100)

        sess = sig.get("session", {})
        start_utc = sess.get("start_utc", "07:00")
        end_utc = sess.get("end_utc", "15:30")
        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(idx, [(start_utc, end_utc)]), dtype=bool
        )

        exits = self.spec.get("exits", {})
        self._sl_mult = exits.get("sl", {}).get("mult", 1.5)
        self._tp_mult = exits.get("tp", {}).get("mult", 4.5)
        self._time_stop_bars = exits.get("time_stop", {}).get("bars", 32)
        trailing = exits.get("trailing", {})
        self._trail_mult = trailing.get("atr_mult", 2.5)
        self._trail_activate_rr = trailing.get("activate_at_rr", 1.0)

        sizing = self.spec.get("sizing", {})
        self._risk_pct = sizing.get("risk_per_trade_pct", 0.5)
        self._max_concurrent = sizing.get("max_concurrent", 1)

        self._adx_min = 22.0
        self._atr_pct_min = 25.0
        self._atr_pct_max = 95.0

        self._last_entry_bar = -1

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 1:
            return False
        adx_v = float(self._adx_series[-1])
        if np.isnan(adx_v) or adx_v < self._adx_min:
            return False
        atrp = float(self._atr_pct[-1])
        if np.isnan(atrp):
            return False
        if atrp < self._atr_pct_min or atrp > self._atr_pct_max:
            return False
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        idx = self.data.index
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not risk.daily_kill_ok(
            self._kill_state, now_date, self.equity,
            self.spec.get("risk", {}).get("daily_dd_kill_pct", 5.0)
        ):
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if len(self.data) < 3:
            return
        bar_i = len(self.data) - 1
        if bar_i == self._last_entry_bar:
            return

        try:
            upper = float(self._donch[0][-2])
            lower = float(self._donch[1][-2])
        except Exception:
            try:
                upper = float(self._donch.s1[-2])
                lower = float(self._donch.s2[-2])
            except Exception:
                return

        if np.isnan(upper) or np.isnan(lower):
            return

        close = float(self.data.Close[-1])
        ema_f = float(self._ema_fast[-1])
        ema_s = float(self._ema_slow[-1])
        adx_v = float(self._adx_series[-1])
        atr_v = float(self._atr_series[-1])

        if np.isnan(ema_f) or np.isnan(ema_s) or np.isnan(adx_v) or np.isnan(atr_v):
            return
        if atr_v <= 0:
            return

        long_sig = (close > upper) and (ema_f > ema_s) and (adx_v > self._adx_min)
        short_sig = (close < lower) and (ema_f < ema_s) and (adx_v > self._adx_min)

        if not (long_sig or short_sig):
            return

        sl_dist = self._sl_mult * atr_v
        tp_dist = self._tp_mult * atr_v

        if long_sig:
            sl = close - sl_dist
            tp = close + tp_dist
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                stop_distance=sl_dist,
                price=close,
                symbol=self._symbol,
            )
            if size is None or size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                pass
        elif short_sig:
            sl = close + sl_dist
            tp = close - tp_dist
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                stop_distance=sl_dist,
                price=close,
                symbol=self._symbol,
            )
            if size is None or size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                pass

    def _manage_open(self) -> None:
        if not self.position:
            return

        if self._time_stop_bars and self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self._time_stop_bars:
                self.position.close()
                return

        if not self.trades:
            return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return

        price = float(self.data.Close[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])

        for trade in self.trades:
            entry = trade.entry_price
            if trade.is_long:
                init_risk = entry - (trade.sl if trade.sl is not None else entry - atr_now * self._sl_mult)
                if init_risk <= 0:
                    continue
                rr = (price - entry) / init_risk
                if rr >= self._trail_activate_rr:
                    new_sl = high - self._trail_mult * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        try:
                            trade.sl = new_sl
                        except Exception:
                            pass
            else:
                init_risk = (trade.sl if trade.sl is not None else entry + atr_now * self._sl_mult) - entry
                if init_risk <= 0:
                    continue
                rr = (entry - price) / init_risk
                if rr >= self._trail_activate_rr:
                    new_sl = low + self._trail_mult * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        try:
                            trade.sl = new_sl
                        except Exception:
                            pass

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()