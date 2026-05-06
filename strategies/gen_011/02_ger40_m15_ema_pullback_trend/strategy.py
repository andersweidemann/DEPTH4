import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    risk_pct = 0.6
    adx_min = 22.0
    adx_max = 45.0
    atr_sl_mult = 1.5
    rr_tp = 2.0
    partial_r = 1.0
    trail_atr_mult = 1.5
    time_stop_bars = 20
    cooldown_bars = 3
    session_start_utc = 7
    session_end_utc = 16

    def init(self):
        try:
            spec_file = Path(__file__).parent / self.spec_path
            if spec_file.exists():
                self._spec = json.loads(spec_file.read_text())
        except Exception:
            pass

        self.spec = dict(self._spec) if self._spec else {}
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self._broker_spread_points = 0

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        hours = pd.DatetimeIndex(idx).hour
        self._session_mask_full = np.asarray(
            (hours >= self.session_start_utc) & (hours < self.session_end_utc),
            dtype=bool,
        )

        self._ema20 = self.I(signals.ema, self.data.Close, 20)
        self._ema50 = self.I(signals.ema, self.data.Close, 50)
        self._ema200 = self.I(signals.ema, self.data.Close, 200)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._rsi_series = self.I(signals.rsi, self.data.Close, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)

        self._last_entry_bar = -10_000
        self._partial_done = {}

    def _session_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            return bool(mask[bar_i])
        return True

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val):
            return False
        return self.adx_min < adx_val < self.adx_max

    def _filters_ok(self) -> bool:
        if not self._session_ok():
            return False
        idx = self.data.index
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        try:
            dd_kill = self.spec.get("risk", {}).get(
                "daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"]
            )
        except Exception:
            dd_kill = 5.0
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self.cooldown_bars:
            return

        e20 = float(self._ema20[-1])
        e50 = float(self._ema50[-1])
        e200 = float(self._ema200[-1])
        atr_v = float(self._atr_series[-1])
        rsi_v = float(self._rsi_series[-1])
        close = float(self.data.Close[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])

        if any(np.isnan(x) for x in (e20, e50, e200, atr_v, rsi_v)):
            return
        if atr_v <= 0:
            return

        long_trend = e20 > e50 > e200
        short_trend = e20 < e50 < e200

        long_sig = (
            long_trend
            and (low <= e20)
            and (close > e20)
            and (40.0 <= rsi_v <= 65.0)
        )
        short_sig = (
            short_trend
            and (high >= e20)
            and (close < e20)
            and (35.0 <= rsi_v <= 60.0)
        )

        if long_sig:
            sl = e50 - self.atr_sl_mult * atr_v
            if sl >= close:
                return
            r = close - sl
            tp = close + self.rr_tp * r
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                entry=close,
                stop=sl,
                symbol=self._symbol,
            )
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                return
        elif short_sig:
            sl = e50 + self.atr_sl_mult * atr_v
            if sl <= close:
                return
            r = sl - close
            tp = close - self.rr_tp * r
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                entry=close,
                stop=sl,
                symbol=self._symbol,
            )
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                return

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return

        atr_v = float(self._atr_series[-1])
        price = float(self.data.Close[-1])

        for trade in list(self.trades):
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self.time_stop_bars:
                trade.close()
                continue

            entry = trade.entry_price
            tag = id(trade)

            if trade.is_long:
                r = entry - (trade.sl if trade.sl is not None else entry)
                if r > 0 and not self._partial_done.get(tag):
                    if price >= entry + self.partial_r * r:
                        try:
                            trade.close(portion=0.5)
                            self._partial_done[tag] = True
                        except Exception:
                            pass
                if self._partial_done.get(tag) and not np.isnan(atr_v):
                    new_sl = price - self.trail_atr_mult * atr_v
                    if trade.sl is None or new_sl > trade.sl:
                        try:
                            trade.sl = new_sl
                        except Exception:
                            pass
            else:
                r = (trade.sl if trade.sl is not None else entry) - entry
                if r > 0 and not self._partial_done.get(tag):
                    if price <= entry - self.partial_r * r:
                        try:
                            trade.close(portion=0.5)
                            self._partial_done[tag] = True
                        except Exception:
                            pass
                if self._partial_done.get(tag) and not np.isnan(atr_v):
                    new_sl = price + self.trail_atr_mult * atr_v
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