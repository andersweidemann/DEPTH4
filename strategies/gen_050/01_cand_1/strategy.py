import json
import os
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


def _rsi_wrap(close, period):
    return signals.rsi(close, period)


def _atr_wrap(data, period):
    return signals.atr(data, period)


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        super().init()

        self._atr_series = self.I(_atr_wrap, self.data, 14)
        self._rsi_series = self.I(_rsi_wrap, self.data.Close, 9)

        df = self.data.df if hasattr(self.data, "df") else self.data
        idx = df.index

        # H1 ADX for regime
        try:
            h1 = pd.DataFrame({
                "Open": df["Open"],
                "High": df["High"],
                "Low": df["Low"],
                "Close": df["Close"],
            }).resample("1h").agg({
                "Open": "first", "High": "max", "Low": "min", "Close": "last"
            }).dropna()
            adx_h1 = regime.adx(h1, 14)
            adx_h1_reindexed = adx_h1.reindex(idx, method="ffill")
            self._adx_h1_full = np.asarray(adx_h1_reindexed.values, dtype=float)
        except Exception:
            self._adx_h1_full = np.full(len(idx), np.nan)

        # ATR percentile
        try:
            atr_pct = regime.atr_percentile(df, 14, 200)
            self._atr_pct_full = np.asarray(atr_pct.values, dtype=float)
        except Exception:
            self._atr_pct_full = np.full(len(idx), np.nan)

        # Regime classification
        try:
            reg_series = regime.classify(df)
            self._regime_full = np.asarray(reg_series.values)
        except Exception:
            self._regime_full = np.array(["RANGE"] * len(idx))

        # Precompute OR high/low per date using 07:00-08:30 UTC
        ts = pd.DatetimeIndex(idx)
        self._ts = ts
        minutes = ts.hour * 60 + ts.minute
        or_build_mask = (minutes >= 7 * 60) & (minutes < 8 * 60 + 30)
        or_trade_mask = (minutes >= 8 * 60 + 30) & (minutes < 15 * 60)
        self._or_build_mask = or_build_mask
        self._or_trade_mask = or_trade_mask

        dates = ts.date
        self._dates = dates

        highs = np.asarray(df["High"].values, dtype=float)
        lows = np.asarray(df["Low"].values, dtype=float)

        or_high = np.full(len(idx), np.nan)
        or_low = np.full(len(idx), np.nan)

        current_date = None
        cur_high = -np.inf
        cur_low = np.inf
        day_high = np.nan
        day_low = np.nan
        build_done = False

        for i in range(len(idx)):
            d = dates[i]
            if d != current_date:
                current_date = d
                cur_high = -np.inf
                cur_low = np.inf
                day_high = np.nan
                day_low = np.nan
                build_done = False
            if or_build_mask[i]:
                if highs[i] > cur_high:
                    cur_high = highs[i]
                if lows[i] < cur_low:
                    cur_low = lows[i]
                day_high = cur_high
                day_low = cur_low
            elif minutes[i] >= 8 * 60 + 30 and not build_done:
                if np.isfinite(cur_high) and np.isfinite(cur_low):
                    day_high = cur_high
                    day_low = cur_low
                build_done = True
            or_high[i] = day_high if np.isfinite(day_high) else np.nan
            or_low[i] = day_low if np.isfinite(day_low) else np.nan

        self._or_high_full = or_high
        self._or_low_full = or_low

        self._last_entry_bar = -10_000
        self._last_entry_date = None

    def _regime_ok_custom(self) -> bool:
        i = len(self.data) - 1
        if i < 0 or i >= len(self._adx_h1_full):
            return False
        adx_val = self._adx_h1_full[i]
        atr_pct = self._atr_pct_full[i]
        reg_label = self._regime_full[i] if i < len(self._regime_full) else "RANGE"
        if np.isnan(adx_val) or adx_val >= 30:
            return False
        if np.isnan(atr_pct) or atr_pct < 20 or atr_pct > 85:
            return False
        if str(reg_label).lower().find("strong_trend") >= 0 or str(reg_label) == "STRONG_TREND":
            return False
        return True

    def next(self):
        i = len(self.data) - 1
        if i < 20:
            return

        # Manage open positions
        if self.position:
            self._manage_open_custom()
            return

        # Cooldown
        if i - self._last_entry_bar < 12:
            return

        if not self._or_trade_mask[i]:
            return

        or_high = self._or_high_full[i]
        or_low = self._or_low_full[i]
        if np.isnan(or_high) or np.isnan(or_low):
            return

        today = self._dates[i]
        if self._last_entry_date == today:
            return

        if not self._regime_ok_custom():
            return

        # Daily kill check
        now_date = pd.Timestamp(self._ts[i]).strftime("%Y-%m-%d")
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity,
                                  self.spec.get("risk", {}).get("daily_dd_kill_pct", 5.0)):
            return

        atr_val = float(self._atr_series[-1])
        if np.isnan(atr_val) or atr_val <= 0:
            return

        rsi_now = float(self._rsi_series[-1])
        rsi_prev = float(self._rsi_series[-2])
        if np.isnan(rsi_now) or np.isnan(rsi_prev):
            return

        close = float(self.data.Close[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])

        or_width = or_high - or_low
        or_mid = 0.5 * (or_high + or_low)
        if or_width <= 0:
            return

        long_probe = low < (or_low - 0.15 * atr_val)
        long_back_in = close > or_low
        long_rsi_cross = (rsi_prev <= 32) and (rsi_now > 32)

        short_probe = high > (or_high + 0.15 * atr_val)
        short_back_in = close < or_high
        short_rsi_cross = (rsi_prev >= 68) and (rsi_now < 68)

        risk_pct = float(self.spec.get("sizing", {}).get("risk_pct", 0.5))

        if long_probe and long_back_in and long_rsi_cross:
            sl_dist = min(1.3 * atr_val, 1.1 * or_width)
            sl = or_low - sl_dist
            tp = or_mid
            if sl >= close or tp <= close:
                return
            size = self._compute_size(close, sl, risk_pct)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.buy(size=size, sl=sl, tp=tp)
            self._last_entry_bar = i
            self._last_entry_date = today

        elif short_probe and short_back_in and short_rsi_cross:
            sl_dist = min(1.3 * atr_val, 1.1 * or_width)
            sl = or_high + sl_dist
            tp = or_mid
            if sl <= close or tp >= close:
                return
            size = self._compute_size(close, sl, risk_pct)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.sell(size=size, sl=sl, tp=tp)
            self._last_entry_bar = i
            self._last_entry_date = today

    def _compute_size(self, price: float, sl: float, risk_pct: float):
        try:
            lots = risk.lots_by_risk_pct(
                equity=float(self.equity),
                risk_pct=risk_pct,
                entry=price,
                stop=sl,
                symbol=self._symbol,
            )
        except Exception:
            stop_dist = abs(price - sl)
            if stop_dist <= 0:
                return 0
            risk_amount = float(self.equity) * (risk_pct / 100.0)
            lots = risk_amount / stop_dist
        if lots is None or lots <= 0:
            return 0
        units = max(1, int(lots))
        max_units = max(1, int((float(self.equity) * 0.95) / max(price, 1e-6)))
        return min(units, max_units)

    def _manage_open_custom(self):
        i = len(self.data) - 1
        if not self.trades:
            return
        trade = self.trades[-1]
        bars_open = i - trade.entry_bar
        if bars_open >= 24:
            self.position.close()
            return

        or_high = self._or_high_full[i]
        or_low = self._or_low_full[i]
        if np.isnan(or_high) or np.isnan(or_low):
            return
        or_width = or_high - or_low
        if or_width <= 0:
            return

        entry = float(trade.entry_price)
        price = float(self.data.Close[-1])

        if trade.is_long:
            initial_risk = entry - (trade.sl if trade.sl is not None else entry)
            if initial_risk > 0:
                r_mult = (price - entry) / initial_risk
                if r_mult >= 0.7 and (trade.sl is None or trade.sl < entry):
                    trade.sl = entry
            partial_target = entry + 0.5 * or_width
            if price >= partial_target and trade.size > 1 and not getattr(trade, "_partial_done", False):
                try:
                    trade.close(portion=0.5)
                    trade._partial_done = True
                except Exception:
                    pass
        else:
            initial_risk = (trade.sl if trade.sl is not None else entry) - entry
            if initial_risk > 0:
                r_mult = (entry - price) / initial_risk
                if r_mult >= 0.7 and (trade.sl is None or trade.sl > entry):
                    trade.sl = entry
            partial_target = entry - 0.5 * or_width
            if price <= partial_target and abs(trade.size) > 1 and not getattr(trade, "_partial_done", False):
                try:
                    trade.close(portion=0.5)
                    trade._partial_done = True
                except Exception:
                    pass