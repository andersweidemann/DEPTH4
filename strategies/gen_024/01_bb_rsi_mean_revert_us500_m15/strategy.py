import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        super().init()

        # Indicators
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._rsi_series = self.I(signals.rsi, self.data.Close, 7)

        def _bb_upper(close, n, k):
            mid, up, lo = signals.bollinger(close, n, k)
            return up

        def _bb_lower(close, n, k):
            mid, up, lo = signals.bollinger(close, n, k)
            return lo

        def _bb_mid(close, n, k):
            mid, up, lo = signals.bollinger(close, n, k)
            return mid

        self._bb_upper = self.I(_bb_upper, self.data.Close, 20, 2.0)
        self._bb_lower = self.I(_bb_lower, self.data.Close, 20, 2.0)
        self._bb_mid = self.I(_bb_mid, self.data.Close, 20, 2.0)
        self._bb_width = self.I(signals.bb_width, self.data.Close, 20, 2.0)

        # BB width percentile over 200 bars
        def _bbw_pctile(close, n, k, lookback):
            mid, up, lo = signals.bollinger(close, n, k)
            width = (np.asarray(up) - np.asarray(lo)) / np.where(
                np.asarray(mid) == 0, np.nan, np.asarray(mid)
            )
            out = np.full_like(width, np.nan, dtype=float)
            for i in range(len(width)):
                start = max(0, i - lookback + 1)
                window = width[start : i + 1]
                w_valid = window[~np.isnan(window)]
                if len(w_valid) < 20 or np.isnan(width[i]):
                    out[i] = np.nan
                else:
                    out[i] = (w_valid <= width[i]).sum() / len(w_valid)
            return out

        self._bbw_pct = self.I(_bbw_pctile, self.data.Close, 20, 2.0, 200)

        # Session mask: 13:30-20:00 UTC
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(full_idx, ["13:30-20:00"]), dtype=bool
        )

        self._last_entry_bar = -10_000
        self._cooldown_bars = 3

    def _regime_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if self._session_mask_full is not None and bar_i < len(self._session_mask_full):
            if not bool(self._session_mask_full[bar_i]):
                return False
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val > 25:
            return False
        bbw_pct = float(self._bbw_pct[-1])
        if np.isnan(bbw_pct):
            return False
        if bbw_pct < 0.30 or bbw_pct > 0.95:
            return False
        return True

    def _filters_ok(self) -> bool:
        idx = self.data.index
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        try:
            dd_kill = config.load()["risk"]["daily_dd_kill_pct"]
        except Exception:
            dd_kill = 0.05
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False
        return True

    def next(self):
        if not self._regime_ok():
            self._manage_open_custom()
            return
        if not self._filters_ok():
            self._manage_open_custom()
            return
        if not self.position:
            self._enter_if_signal()
        else:
            self._manage_open_custom()

    def _enter_if_signal(self) -> None:
        if self.position:
            return

        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self._cooldown_bars:
            return

        if len(self.data.Close) < 22:
            return

        close = float(self.data.Close[-1])
        prev_close = float(self.data.Close[-2])
        upper = float(self._bb_upper[-1])
        lower = float(self._bb_lower[-1])
        upper_p = float(self._bb_upper[-2])
        lower_p = float(self._bb_lower[-2])
        rsi_val = float(self._rsi_series[-1])
        atr_val = float(self._atr_series[-1])

        if any(np.isnan(x) for x in [upper, lower, upper_p, lower_p, rsi_val, atr_val]):
            return
        if atr_val <= 0:
            return

        long_sig = (
            close < lower and prev_close < lower_p and rsi_val < 12
        )
        short_sig = (
            close > upper and prev_close > upper_p and rsi_val > 88
        )

        if not (long_sig or short_sig):
            return

        sl_dist = 1.75 * atr_val
        risk_pct = self.spec.get("sizing", {}).get("risk_per_trade_pct", 0.5)

        if long_sig:
            sl = close - sl_dist
            tp = float(self._bb_mid[-1])
            r = close - sl
            if tp - close < r:
                tp = close + r
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=risk_pct,
                entry=close,
                stop=sl,
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
            sl = close + sl_dist
            tp = float(self._bb_mid[-1])
            r = sl - close
            if close - tp < r:
                tp = close - r
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=risk_pct,
                entry=close,
                stop=sl,
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

    def _manage_open_custom(self) -> None:
        if not self.position or not self.trades:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar

        if bars_open >= 24:
            self.position.close()
            return

        rsi_val = float(self._rsi_series[-1])
        if bars_open >= 4 and not np.isnan(rsi_val):
            if trade.is_long and rsi_val < 50:
                self.position.close()
                return
            if (not trade.is_long) and rsi_val > 50:
                self.position.close()
                return

        mid = float(self._bb_mid[-1])
        upper = float(self._bb_upper[-1])
        lower = float(self._bb_lower[-1])
        close = float(self.data.Close[-1])
        if not np.isnan(mid):
            if trade.is_long:
                if close >= mid or (not np.isnan(upper) and close >= upper):
                    self.position.close()
                    return
            else:
                if close <= mid or (not np.isnan(lower) and close <= lower):
                    self.position.close()
                    return