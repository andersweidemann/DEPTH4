import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, regime, risk


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    donchian_len = 20
    ema_trend_len = 50
    adx_len = 14
    adx_min = 22
    atr_len = 14
    atr_pct_min = 40
    atr_pct_window = 100

    sl_atr_mult = 2.0
    tp_atr_mult = 3.5
    trail_atr_mult = 3.0
    trail_activate_atr = 1.5
    time_stop_bars = 48

    risk_pct = 0.75
    cooldown_bars = 6

    def init(self):
        try:
            p = Path(__file__).parent / self.spec_path
            if p.exists():
                self._spec = json.loads(p.read_text())
        except Exception:
            pass

        super().init()

        params = self._spec.get("params", {}) if isinstance(self._spec, dict) else {}
        self.donchian_len = int(params.get("donchian_len", self.donchian_len))
        self.ema_trend_len = int(params.get("ema_trend_len", self.ema_trend_len))
        self.adx_len = int(params.get("adx_len", self.adx_len))
        self.adx_min = float(params.get("adx_min", self.adx_min))
        self.atr_len = int(params.get("atr_len", self.atr_len))
        self.atr_pct_min = float(params.get("atr_pct_min", self.atr_pct_min))

        don = self.I(signals.donchian, self.data, self.donchian_len)
        self._don_upper = don[0]
        self._don_lower = don[1]

        self._ema = self.I(signals.ema, self.data.Close, self.ema_trend_len)
        self._atr_series = self.I(signals.atr, self.data, self.atr_len)
        self._adx_series = self.I(regime.adx, self.data, self.adx_len)
        self._atr_pct = self.I(regime.atr_percentile, self.data, self.atr_len, self.atr_pct_window)

        df = self.data.df if hasattr(self.data, "df") else self.data
        idx = df.index
        london = ("07:00", "11:00")
        ny = ("13:00", "17:00")
        try:
            m1 = np.asarray(signals.session_mask(idx, [london]), dtype=bool)
            m2 = np.asarray(signals.session_mask(idx, [ny]), dtype=bool)
            self._sess_mask = m1 | m2
        except Exception:
            try:
                self._sess_mask = np.asarray(
                    signals.session_mask(idx, [london, ny]), dtype=bool)
            except Exception:
                self._sess_mask = np.ones(len(idx), dtype=bool)

        self._last_exit_bar = -10_000
        self._entry_bar_idx: Optional[int] = None
        self._entry_price: Optional[float] = None
        self._trail_active = False
        self._highest_since_entry: Optional[float] = None
        self._lowest_since_entry: Optional[float] = None

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 2:
            return False
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val < self.adx_min:
            return False
        atr_pct = float(self._atr_pct[-1])
        if np.isnan(atr_pct) or atr_pct < self.atr_pct_min:
            return False
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if self._sess_mask is not None and 0 <= bar_i < len(self._sess_mask):
            if not bool(self._sess_mask[bar_i]):
                return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_exit_bar < self.cooldown_bars:
            return
        if len(self.data.Close) < max(self.donchian_len, self.ema_trend_len) + 2:
            return

        close_prev = float(self.data.Close[-2])
        close_now = float(self.data.Close[-1])
        don_up_prev = float(self._don_upper[-2])
        don_lo_prev = float(self._don_lower[-2])
        ema_now = float(self._ema[-1])
        atr_now = float(self._atr_series[-1])

        if np.isnan(atr_now) or atr_now <= 0:
            return
        if np.isnan(don_up_prev) or np.isnan(don_lo_prev) or np.isnan(ema_now):
            return

        price = close_now
        long_sig = close_prev > don_up_prev and close_now > ema_now
        short_sig = close_prev < don_lo_prev and close_now < ema_now

        if not (long_sig or short_sig):
            return

        sl_dist = self.sl_atr_mult * atr_now
        tp_dist = self.tp_atr_mult * atr_now

        if long_sig:
            sl = price - sl_dist
            tp = price + tp_dist
        else:
            sl = price + sl_dist
            tp = price - tp_dist

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                entry=price,
                stop=sl,
                symbol=self._symbol,
            )
        except Exception:
            size = None

        if size is None or not np.isfinite(size) or size <= 0:
            risk_cash = self.equity * (self.risk_pct / 100.0)
            per_unit = abs(price - sl)
            if per_unit <= 0:
                return
            units = risk_cash / per_unit
            notional = units * price
            frac = notional / self.equity if self.equity > 0 else 0
            if frac <= 0:
                return
            size = min(0.99, max(0.001, frac))

        self.sl_price = sl
        self.tp_price = tp

        try:
            if long_sig:
                self.buy(size=size, sl=sl, tp=tp)
            else:
                self.sell(size=size, sl=sl, tp=tp)
            self._entry_bar_idx = bar_i
            self._entry_price = price
            self._trail_active = False
            self._highest_since_entry = float(self.data.High[-1])
            self._lowest_since_entry = float(self.data.Low[-1])
        except Exception:
            pass

    def _manage_open(self) -> None:
        if not self.position:
            if self._entry_bar_idx is not None:
                self._last_exit_bar = len(self.data) - 1
                self._entry_bar_idx = None
                self._entry_price = None
                self._trail_active = False
                self._highest_since_entry = None
                self._lowest_since_entry = None
            return

        bar_i = len(self.data) - 1
        high_now = float(self.data.High[-1])
        low_now = float(self.data.Low[-1])
        close_now = float(self.data.Close[-1])
        atr_now = float(self._atr_series[-1]) if len(self._atr_series) else np.nan

        if self._highest_since_entry is None or high_now > self._highest_since_entry:
            self._highest_since_entry = high_now
        if self._lowest_since_entry is None or low_now < self._lowest_since_entry:
            self._lowest_since_entry = low_now

        if self._entry_bar_idx is not None:
            bars_open = bar_i - self._entry_bar_idx
            if bars_open >= self.time_stop_bars:
                self.position.close()
                self._last_exit_bar = bar_i
                self._entry_bar_idx = None
                return

        if not np.isnan(atr_now) and atr_now > 0 and self._entry_price is not None:
            for trade in self.trades:
                if trade.is_long:
                    profit = close_now - trade.entry_price
                    if profit >= self.trail_activate_atr * atr_now:
                        new_sl = self._highest_since_entry - self.trail_atr_mult * atr_now
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                else:
                    profit = trade.entry_price - close_now
                    if profit >= self.trail_activate_atr * atr_now:
                        new_sl = self._lowest_since_entry + self.trail_atr_mult * atr_now
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