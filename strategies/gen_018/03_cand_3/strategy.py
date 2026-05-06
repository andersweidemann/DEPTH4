import json
import os
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, regime, risk, config


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                with open(spec_file, "r") as f:
                    loaded = json.load(f)
                if not self._spec:
                    type(self)._spec = loaded
            except Exception:
                pass

        session_cfg = (self._spec or {}).get("session", {})
        if session_cfg.get("enabled"):
            sess = [{
                "start": session_cfg.get("start_utc", "08:00"),
                "end": session_cfg.get("end_utc", "11:00"),
                "days": session_cfg.get("days", ["Mon","Tue","Wed","Thu","Fri"]),
            }]
            spec_copy = dict(self._spec)
            filters = dict(spec_copy.get("filters", {}))
            filters["session_utc"] = sess
            spec_copy["filters"] = filters
            type(self)._spec = spec_copy

        super().init()

        self._ema_fast = self.I(signals.ema, self.data.Close, 50)
        self._ema_slow = self.I(signals.ema, self.data.Close, 200)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._rsi_series = self.I(signals.rsi, self.data.Close, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct_series = self.I(regime.atr_percentile, self.data, 14, 500)

        self._last_entry_bar = -10_000
        self._last_entry_day = None

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 1:
            return False
        adx_v = float(self._adx_series[-1])
        atr_pct = float(self._atr_pct_series[-1])
        if np.isnan(adx_v) or np.isnan(atr_pct):
            return False
        return adx_v > 22 and atr_pct > 40

    def _enter_if_signal(self) -> None:
        if self.position:
            return

        spec = self._spec
        entry_cfg = spec.get("entry", {})
        cooldown = int(entry_cfg.get("cooldown_bars", 0))
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < cooldown:
            return

        current_day = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        if entry_cfg.get("only_first_signal_per_day") and self._last_entry_day == current_day:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        ema_f = float(self._ema_fast[-1])
        ema_s = float(self._ema_slow[-1])
        atr_v = float(self._atr_series[-1])
        rsi_v = float(self._rsi_series[-1])

        if any(np.isnan(x) for x in (ema_f, ema_s, atr_v, rsi_v)):
            return
        if atr_v <= 0:
            return

        body = close - open_

        long_sig = (ema_f > ema_s and body > 0 and body > 1.0 * atr_v
                    and 55 < rsi_v < 80)
        short_sig = (ema_f < ema_s and body < 0 and (-body) > 1.0 * atr_v
                     and 20 < rsi_v < 45)

        if not (long_sig or short_sig):
            return

        exit_cfg = spec.get("exit", {})
        tp_mult = exit_cfg.get("tp", {}).get("mult", 2.5)
        sl_mult = exit_cfg.get("sl", {}).get("mult", 1.2)

        risk_pct = spec.get("sizing", {}).get("risk_pct_per_trade", 0.5)

        if long_sig:
            sl = close - sl_mult * atr_v
            tp = close + tp_mult * atr_v
            if sl >= close:
                return
            stop_dist = close - sl
        else:
            sl = close + sl_mult * atr_v
            tp = close - tp_mult * atr_v
            if sl <= close:
                return
            stop_dist = sl - close

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=risk_pct,
                stop_distance=stop_dist,
                price=close,
                symbol=self._symbol,
            )
        except TypeError:
            size = risk.lots_by_risk_pct(self.equity, risk_pct, stop_dist)

        if size is None or size <= 0:
            return
        if isinstance(size, float) and size < 1:
            if size <= 0:
                return
        else:
            size = max(1, int(size))

        self.sl_price = sl
        self.tp_price = tp

        if long_sig:
            self.buy(size=size, sl=sl, tp=tp)
        else:
            self.sell(size=size, sl=sl, tp=tp)

        self._last_entry_bar = bar_i
        self._last_entry_day = current_day

    def _manage_open(self) -> None:
        exit_cfg = self._spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop_bars")

        if not self.position:
            return

        if time_stop is not None and self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return

        atr_v = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        if np.isnan(atr_v) or atr_v <= 0:
            return

        price = float(self.data.Close[-1])

        be_r = exit_cfg.get("breakeven_at_r", 1.0)
        trailing = exit_cfg.get("trailing", {})
        trail_mult = trailing.get("mult", 2.0)
        trail_activate_r = trailing.get("activate_at_r", 1.5)
        sl_mult = exit_cfg.get("sl", {}).get("mult", 1.2)

        for trade in self.trades:
            entry = trade.entry_price
            if trade.is_long:
                init_risk = sl_mult * atr_v
                if init_risk <= 0:
                    continue
                r_now = (price - entry) / init_risk
                new_sl = trade.sl
                if r_now >= be_r:
                    candidate = entry
                    if new_sl is None or candidate > new_sl:
                        new_sl = candidate
                if r_now >= trail_activate_r:
                    candidate = price - trail_mult * atr_v
                    if new_sl is None or candidate > new_sl:
                        new_sl = candidate
                if new_sl is not None and (trade.sl is None or new_sl > trade.sl):
                    if new_sl < price:
                        trade.sl = new_sl
            else:
                init_risk = sl_mult * atr_v
                if init_risk <= 0:
                    continue
                r_now = (entry - price) / init_risk
                new_sl = trade.sl
                if r_now >= be_r:
                    candidate = entry
                    if new_sl is None or candidate < new_sl:
                        new_sl = candidate
                if r_now >= trail_activate_r:
                    candidate = price + trail_mult * atr_v
                    if new_sl is None or candidate < new_sl:
                        new_sl = candidate
                if new_sl is not None and (trade.sl is None or new_sl < trade.sl):
                    if new_sl > price:
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