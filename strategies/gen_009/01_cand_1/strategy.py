import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    donchian_n = 20
    atr_n = 14
    ema_n = 50
    adx_n = 14
    atr_pct_lb = 200
    adx_min = 22.0
    atr_pct_min = 0.50
    sl_mult = 1.2
    tp_mult = 3.0
    time_stop_bars = 32
    trail_mult = 2.5
    cooldown_bars = 6
    range_atr_mult = 0.8
    risk_pct = 0.5

    def init(self):
        try:
            p = Path(__file__).parent / self.spec_path
            if p.exists():
                self._spec = json.loads(p.read_text())
        except Exception:
            pass
        super().init()

        self._atr_series = self.I(signals.atr, self.data, self.atr_n)
        dc = self.I(signals.donchian, self.data, self.donchian_n)
        if isinstance(dc, tuple) or (hasattr(dc, "ndim") and getattr(dc, "ndim", 1) > 1):
            self._dc_high = dc[0]
            self._dc_low = dc[1]
        else:
            self._dc_high = dc
            self._dc_low = self.I(
                lambda d, n: pd.Series(d.Low).rolling(n).min().bfill().values,
                self.data, self.donchian_n,
            )

        self._ema_series = self.I(signals.ema, self.data.Close, self.ema_n)
        self._adx_series = self.I(regime.adx, self.data, self.adx_n)
        self._atr_pct_series = self.I(regime.atr_percentile, self.data, self.atr_n, self.atr_pct_lb)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(idx, ["07:00-16:00"]), dtype=bool
        )

        self._last_entry_bar = -10**9

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 2:
            return False
        adx_v = float(self._adx_series[-1])
        atrp = float(self._atr_pct_series[-1])
        if np.isnan(adx_v) or np.isnan(atrp):
            return False
        return adx_v > self.adx_min and atrp > self.atr_pct_min

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        dd_kill = self.spec.get("risk", {}).get(
            "daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"]
        )
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self.cooldown_bars:
            return
        if len(self._dc_high) < 3:
            return

        close = float(self.data.Close[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])
        atr_v = float(self._atr_series[-1])
        ema_v = float(self._ema_series[-1])
        dc_hi_prev = float(self._dc_high[-2])
        dc_lo_prev = float(self._dc_low[-2])

        if np.isnan(atr_v) or atr_v <= 0 or np.isnan(ema_v):
            return

        rng_ok = (high - low) > self.range_atr_mult * atr_v
        if not rng_ok:
            return

        long_sig = close > dc_hi_prev and close > ema_v
        short_sig = close < dc_lo_prev and close < ema_v

        if long_sig:
            sl = close - self.sl_mult * atr_v
            tp = close + self.tp_mult * atr_v
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                entry=close,
                sl=sl,
                symbol=self._symbol,
            )
            if size and size > 0:
                self.sl_price = sl
                self.tp_price = tp
                try:
                    self.buy(size=size, sl=sl, tp=tp)
                    self._last_entry_bar = bar_i
                except Exception:
                    pass
        elif short_sig:
            sl = close + self.sl_mult * atr_v
            tp = close - self.tp_mult * atr_v
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                entry=close,
                sl=sl,
                symbol=self._symbol,
            )
            if size and size > 0:
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
        if self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self.time_stop_bars:
                self.position.close()
                return

        atr_v = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        if np.isnan(atr_v):
            return
        price = float(self.data.Close[-1])
        for trade in self.trades:
            entry = trade.entry_price
            if trade.is_long:
                r = self.sl_mult * atr_v
                if price - entry >= r:
                    new_sl = price - self.trail_mult * atr_v
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                r = self.sl_mult * atr_v
                if entry - price >= r:
                    new_sl = price + self.trail_mult * atr_v
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