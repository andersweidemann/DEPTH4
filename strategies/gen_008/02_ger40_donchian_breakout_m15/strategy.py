import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, regime, risk, config


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    donchian_period = 20
    ema_period = 50
    sl_atr_mult = 1.5
    tp_atr_mult = 3.0
    atr_period = 14
    adx_period = 14
    atr_pct_lookback = 200
    atr_pct_min = 40
    atr_pct_max = 90
    ema_slope_lookback = 10
    trail_donchian_period = 10
    time_stop_bars = 48
    activate_trail_after_r = 1.0
    breakeven_after_r = 1.0
    risk_per_trade_pct = 0.75
    max_trades_per_day = 3
    session_hours = (7, 8, 9, 10, 11, 12, 13, 14, 15)

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                type(self)._spec = json.loads(spec_file.read_text())
            except Exception:
                pass
        self.spec = dict(self._spec) if self._spec else {}
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self._broker_spread_points = 0

        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(full_idx, list(self.session_hours)), dtype=bool)

        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._adx_series = self.I(regime.adx, self.data, self.adx_period)
        self._atr_pct_series = self.I(
            regime.atr_percentile, self.data, self.atr_period, self.atr_pct_lookback)
        self._ema_series = self.I(signals.ema, self.data.Close, self.ema_period)

        donch = self.I(signals.donchian, self.data, self.donchian_period)
        if isinstance(donch, tuple) or (hasattr(donch, "ndim") and donch.ndim == 2):
            self._donch_upper = donch[0]
            self._donch_lower = donch[1]
        else:
            self._donch_upper = self.I(
                lambda d, n: signals.donchian(d, n)[0], self.data, self.donchian_period)
            self._donch_lower = self.I(
                lambda d, n: signals.donchian(d, n)[1], self.data, self.donchian_period)

        trail = self.I(signals.donchian, self.data, self.trail_donchian_period)
        if isinstance(trail, tuple) or (hasattr(trail, "ndim") and trail.ndim == 2):
            self._trail_upper = trail[0]
            self._trail_lower = trail[1]
        else:
            self._trail_upper = self.I(
                lambda d, n: signals.donchian(d, n)[0], self.data, self.trail_donchian_period)
            self._trail_lower = self.I(
                lambda d, n: signals.donchian(d, n)[1], self.data, self.trail_donchian_period)

        self._trades_today = 0
        self._current_day = None

    def _regime_ok(self) -> bool:
        try:
            adx_v = float(self._adx_series[-1])
            if np.isnan(adx_v) or adx_v < 20:
                return False
        except Exception:
            return False

        try:
            atr_pct = float(self._atr_pct_series[-1])
            if np.isnan(atr_pct):
                return False
            if atr_pct < self.atr_pct_min or atr_pct > self.atr_pct_max:
                return False
        except Exception:
            return False

        try:
            if len(self._ema_series) <= self.ema_slope_lookback:
                return False
            ema_now = float(self._ema_series[-1])
            ema_prev = float(self._ema_series[-1 - self.ema_slope_lookback])
            if np.isnan(ema_now) or np.isnan(ema_prev):
                return False
            if ema_now == ema_prev:
                return False
        except Exception:
            return False

        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False

        idx = self.data.index
        now_ts = pd.Timestamp(idx[-1])
        now_date = now_ts.strftime("%Y-%m-%d")
        if self._current_day != now_date:
            self._current_day = now_date
            self._trades_today = 0

        try:
            cfg = config.load()
            dd_kill = self.spec.get("risk", {}).get(
                "daily_dd_kill_pct", cfg["risk"]["daily_dd_kill_pct"])
        except Exception:
            dd_kill = 0.05
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False

        if self._trades_today >= self.max_trades_per_day:
            return False

        return True

    def next(self):
        self._manage_open()

        if self.position:
            return

        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        self._enter_if_signal()

    def _enter_if_signal(self) -> None:
        if len(self.data) < max(self.donchian_period, self.ema_period) + 2:
            return

        close = float(self.data.Close[-1])
        prev_close = float(self.data.Close[-2])
        ema_v = float(self._ema_series[-1])
        atr_v = float(self._atr_series[-1])
        upper_prev = float(self._donch_upper[-2])
        lower_prev = float(self._donch_lower[-2])

        if np.isnan(ema_v) or np.isnan(atr_v) or atr_v <= 0:
            return
        if np.isnan(upper_prev) or np.isnan(lower_prev):
            return

        long_signal = (close > upper_prev) and (prev_close <= upper_prev) and (close > ema_v)
        short_signal = (close < lower_prev) and (prev_close >= lower_prev) and (close < ema_v)

        if not (long_signal or short_signal):
            return

        if long_signal:
            sl = close - self.sl_atr_mult * atr_v
            tp = close + self.tp_atr_mult * atr_v
            if sl >= close:
                return
            size = self._calc_size(close, sl)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._trades_today += 1
            except Exception:
                pass
        elif short_signal:
            sl = close + self.sl_atr_mult * atr_v
            tp = close - self.tp_atr_mult * atr_v
            if sl <= close:
                return
            size = self._calc_size(close, sl)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._trades_today += 1
            except Exception:
                pass

    def _calc_size(self, entry: float, sl: float) -> float:
        try:
            lots = risk.lots_by_risk_pct(
                equity=float(self.equity),
                risk_pct=self.risk_per_trade_pct,
                entry=entry,
                sl=sl,
                symbol=self._symbol,
            )
        except TypeError:
            try:
                lots = risk.lots_by_risk_pct(
                    float(self.equity), self.risk_per_trade_pct, entry, sl)
            except Exception:
                lots = 0.0
        except Exception:
            lots = 0.0

        if lots is None or lots <= 0:
            return 0.0

        if lots >= 1:
            return max(1, int(lots))
        frac = float(lots)
        if frac <= 0 or frac >= 1:
            return 0.0
        return frac

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return

        close = float(self.data.Close[-1])
        atr_v = float(self._atr_series[-1]) if len(self._atr_series) else np.nan

        for trade in self.trades:
            bars_open = len(self.data) - trade.entry_bar
            if self.time_stop_bars and bars_open >= self.time_stop_bars:
                try:
                    trade.close()
                except Exception:
                    pass
                continue

            entry = float(trade.entry_price)
            if np.isnan(atr_v) or atr_v <= 0:
                continue

            init_risk = self.sl_atr_mult * atr_v
            if init_risk <= 0:
                continue

            if trade.is_long:
                r_mult = (close - entry) / init_risk
                if r_mult >= self.breakeven_after_r:
                    if trade.sl is None or trade.sl < entry:
                        try:
                            trade.sl = entry
                        except Exception:
                            pass
                if r_mult >= self.activate_trail_after_r:
                    trail_sl = float(self._trail_lower[-1])
                    if not np.isnan(trail_sl):
                        if trade.sl is None or trail_sl > trade.sl:
                            try:
                                trade.sl = trail_sl
                            except Exception:
                                pass
            else:
                r_mult = (entry - close) / init_risk
                if r_mult >= self.breakeven_after_r:
                    if trade.sl is None or trade.sl > entry:
                        try:
                            trade.sl = entry
                        except Exception:
                            pass
                if r_mult >= self.activate_trail_after_r:
                    trail_sl = float(self._trail_upper[-1])
                    if not np.isnan(trail_sl):
                        if trade.sl is None or trail_sl < trade.sl:
                            try:
                                trade.sl = trail_sl
                            except Exception:
                                pass