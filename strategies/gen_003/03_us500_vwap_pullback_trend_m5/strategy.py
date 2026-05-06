import json
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        super().init()

        self._ema20 = self.I(signals.ema, self.data.Close, 20)
        self._ema50 = self.I(signals.ema, self.data.Close, 50)
        self._ema200 = self.I(signals.ema, self.data.Close, 200)
        self._rsi = self.I(signals.rsi, self.data.Close, 14)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct = self.I(regime.atr_percentile, self.data, 14, 150)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(idx, [("13:30", "20:00")]), dtype=bool
        )
        self._hardclose_mask = np.asarray(
            [pd.Timestamp(t).strftime("%H:%M") >= "20:15" for t in idx], dtype=bool
        )

        self._last_exit_bar = -10_000
        self._entry_bar_idx: Dict[int, int] = {}
        self._entry_r: Dict[int, float] = {}
        self._tp1_done: set = set()

    def _regime_ok(self) -> bool:
        if len(self.data) < 210:
            return False
        adx_v = float(self._adx_series[-1])
        atrp = float(self._atr_pct[-1])
        if np.isnan(adx_v) or np.isnan(atrp):
            return False
        if adx_v < 18:
            return False
        if atrp < 0.25 or atrp > 0.95:
            return False
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if 0 <= bar_i < len(self._session_mask_full):
            if not bool(self._session_mask_full[bar_i]):
                return False
        return True

    def _hard_close_time(self) -> bool:
        bar_i = len(self.data) - 1
        if 0 <= bar_i < len(self._hardclose_mask):
            return bool(self._hardclose_mask[bar_i])
        return False

    def next(self):
        if self._hard_close_time() and self.position:
            self.position.close()
            self._last_exit_bar = len(self.data) - 1
            return

        self._manage_open()

        if self.position:
            return

        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        cur = len(self.data) - 1
        if cur - self._last_exit_bar < 4:
            return

        price = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])
        ema20 = float(self._ema20[-1])
        ema50 = float(self._ema50[-1])
        ema200 = float(self._ema200[-1])
        rsi_v = float(self._rsi[-1])
        atr_v = float(self._atr_series[-1])

        if any(np.isnan(x) for x in (ema20, ema50, ema200, rsi_v, atr_v)):
            return
        if atr_v <= 0:
            return

        bullish = price > open_
        bearish = price < open_
        dist = 0.25 * atr_v

        long_ok = (
            ema50 > ema200
            and low <= ema20 + dist
            and price >= ema20
            and 40 <= rsi_v <= 65
            and bullish
        )
        short_ok = (
            ema50 < ema200
            and high >= ema20 - dist
            and price <= ema20
            and 35 <= rsi_v <= 60
            and bearish
        )

        if not (long_ok or short_ok):
            return

        risk_pct = float(self.spec.get("sizing", {}).get("risk_pct", 0.5))

        if long_ok:
            recent_low = float(np.min(self.data.Low[-10:]))
            sl = min(recent_low, price - 1.5 * atr_v)
            if sl >= price:
                return
            self.sl_price = sl
            self.tp_price = price + 3.5 * (price - sl)
            size = risk.lots_by_risk_pct(
                self.equity, risk_pct, price, sl, self._symbol
            )
            if size <= 0:
                return
            self.buy(size=size, sl=sl, tp=self.tp_price)
            self._entry_bar_idx[cur] = cur
            self._entry_r[cur] = price - sl

        elif short_ok:
            recent_high = float(np.max(self.data.High[-10:]))
            sl = max(recent_high, price + 1.5 * atr_v)
            if sl <= price:
                return
            self.sl_price = sl
            self.tp_price = price - 3.5 * (sl - price)
            size = risk.lots_by_risk_pct(
                self.equity, risk_pct, price, sl, self._symbol
            )
            if size <= 0:
                return
            self.sell(size=size, sl=sl, tp=self.tp_price)
            self._entry_bar_idx[cur] = cur
            self._entry_r[cur] = sl - price

    def _manage_open(self):
        if not self.position or not self.trades:
            return

        price = float(self.data.Close[-1])
        ema20 = float(self._ema20[-1])
        cur = len(self.data) - 1

        for trade in list(self.trades):
            entry_price = float(trade.entry_price)
            if trade.sl is None:
                continue
            r_dist = abs(entry_price - float(trade.sl))
            if r_dist <= 0:
                continue

            if trade.is_long:
                profit = price - entry_price
            else:
                profit = entry_price - price
            r_mult = profit / r_dist

            bars_open = cur - trade.entry_bar

            if bars_open >= 24 and r_mult < 0.5:
                trade.close()
                self._last_exit_bar = cur
                continue

            if r_mult >= 1.0:
                if trade.is_long:
                    new_sl = min(price, ema20)
                    if new_sl > trade.sl:
                        trade.sl = new_sl
                    if price < ema20:
                        trade.close()
                        self._last_exit_bar = cur
                        continue
                else:
                    new_sl = max(price, ema20)
                    if new_sl < trade.sl:
                        trade.sl = new_sl
                    if price > ema20:
                        trade.close()
                        self._last_exit_bar = cur
                        continue

            if r_mult >= 1.5 and id(trade) not in self._tp1_done:
                self._tp1_done.add(id(trade))
                try:
                    trade.close(portion=0.5)
                except Exception:
                    pass
                if trade.is_long:
                    be = entry_price
                    if trade.sl is None or be > trade.sl:
                        trade.sl = be
                else:
                    be = entry_price
                    if trade.sl is None or be < trade.sl:
                        trade.sl = be

        if not self.position:
            self._last_exit_bar = cur