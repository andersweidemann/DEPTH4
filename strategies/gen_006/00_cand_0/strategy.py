import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _upper_bb(data, n, dev):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    mid = close.rolling(n).mean()
    sd = close.rolling(n).std(ddof=0)
    return (mid + dev * sd).to_numpy()


def _lower_bb(data, n, dev):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    mid = close.rolling(n).mean()
    sd = close.rolling(n).std(ddof=0)
    return (mid - dev * sd).to_numpy()


def _mid_bb(data, n):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    return close.rolling(n).mean().to_numpy()


def _bbw(data, n, dev):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    mid = close.rolling(n).mean()
    sd = close.rolling(n).std(ddof=0)
    width = (2.0 * dev * sd) / mid.replace(0, np.nan)
    return width.to_numpy()


def _rsi(data, n):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    delta = close.diff()
    up = delta.clip(lower=0.0)
    dn = (-delta).clip(lower=0.0)
    roll_up = up.ewm(alpha=1.0 / n, adjust=False).mean()
    roll_dn = dn.ewm(alpha=1.0 / n, adjust=False).mean()
    rs = roll_up / roll_dn.replace(0, np.nan)
    return (100.0 - 100.0 / (1.0 + rs)).to_numpy()


def _adx(data, n):
    return regime.adx(data.df if hasattr(data, "df") else data, n)


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                self._spec = json.loads(spec_file.read_text())
            except Exception:
                self._spec = {}
        if not self._spec:
            self._spec = {
                "filters": {"session_utc": [["07:00", "20:00"]]},
                "risk": {"risk_per_trade_pct": 0.5, "cooldown_bars": 3},
                "exit": {"time_stop_bars": 20},
            }
        else:
            self._spec.setdefault("filters", {})
            self._spec["filters"].setdefault("session_utc", [["07:00", "20:00"]])
            self._spec.setdefault("exit", {})
            self._spec["exit"].setdefault("time_stop_bars", 20)

        super().init()

        p = {
            "bb_period": 20,
            "bb_dev": 2.0,
            "rsi_period": 2,
            "rsi_long_th": 10,
            "rsi_short_th": 90,
            "atr_period": 14,
            "sl_atr_mult": 1.5,
            "tp_atr_mult": 2.5,
            "adx_max": 25,
            "bbw_pct_min": 30,
            "bbw_lookback": 500,
            "time_stop_bars": 20,
            "cooldown_bars": 3,
        }

        self._p = p

        self._upper = self.I(_upper_bb, self.data, p["bb_period"], p["bb_dev"])
        self._lower = self.I(_lower_bb, self.data, p["bb_period"], p["bb_dev"])
        self._mid = self.I(_mid_bb, self.data, p["bb_period"])
        self._bbw_ind = self.I(_bbw, self.data, p["bb_period"], p["bb_dev"])
        self._rsi_ind = self.I(_rsi, self.data, p["rsi_period"])
        self._atr_series = self.I(signals.atr, self.data, p["atr_period"])
        self._adx_series = self.I(_adx, self.data, 14)

        bbw_full = np.asarray(self._bbw_ind, dtype=float)
        s = pd.Series(bbw_full)
        self._bbw_thresh_full = s.rolling(p["bbw_lookback"], min_periods=50).quantile(
            p["bbw_pct_min"] / 100.0
        ).to_numpy()

        self._last_exit_bar = -10_000
        self._bar_count_at_entry = None

    def _session_ok(self) -> bool:
        mask = getattr(self, "_session_mask_full", None)
        if mask is None:
            return True
        bar_i = len(self.data) - 1
        if 0 <= bar_i < len(mask):
            return bool(mask[bar_i])
        return True

    def next(self):
        p = self._p
        i = len(self.data) - 1
        if i < max(p["bb_period"], p["atr_period"], 20):
            return

        price = float(self.data.Close[-1])

        if self.position and self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            mid = float(self._mid[-1])
            if trade.is_long:
                if price >= mid or bars_open >= p["time_stop_bars"]:
                    self.position.close()
                    self._last_exit_bar = i
                    return
            else:
                if price <= mid or bars_open >= p["time_stop_bars"]:
                    self.position.close()
                    self._last_exit_bar = i
                    return

        if self.position:
            return

        if (i - self._last_exit_bar) < p["cooldown_bars"]:
            return

        if not self._session_ok():
            return

        if not self._filters_ok():
            return

        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val >= p["adx_max"]:
            return

        bbw_now = float(self._bbw_ind[-1])
        bbw_th = float(self._bbw_thresh_full[i]) if i < len(self._bbw_thresh_full) else np.nan
        if np.isnan(bbw_now) or np.isnan(bbw_th) or bbw_now <= bbw_th:
            return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return

        upper = float(self._upper[-1])
        lower = float(self._lower[-1])
        rsi_val = float(self._rsi_ind[-1])
        if np.isnan(upper) or np.isnan(lower) or np.isnan(rsi_val):
            return

        equity = float(self.equity)
        risk_pct = float(self._spec.get("risk", {}).get("risk_per_trade_pct", 0.5))

        long_sig = price < lower and rsi_val < p["rsi_long_th"]
        short_sig = price > upper and rsi_val > p["rsi_short_th"]

        if long_sig:
            sl = price - p["sl_atr_mult"] * atr_now
            tp_atr = price + p["tp_atr_mult"] * atr_now
            tp = min(tp_atr, upper) if not np.isnan(upper) else tp_atr
            if sl >= price or tp <= price:
                return
            size = risk.lots_by_risk_pct(equity, risk_pct, price, sl, self._symbol)
            if size is None or size <= 0:
                return
            try:
                units = max(1, int(round(float(size))))
            except Exception:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.buy(size=units, sl=sl, tp=tp)
        elif short_sig:
            sl = price + p["sl_atr_mult"] * atr_now
            tp_atr = price - p["tp_atr_mult"] * atr_now
            tp = max(tp_atr, lower) if not np.isnan(lower) else tp_atr
            if sl <= price or tp >= price:
                return
            size = risk.lots_by_risk_pct(equity, risk_pct, price, sl, self._symbol)
            if size is None or size <= 0:
                return
            try:
                units = max(1, int(round(float(size))))
            except Exception:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.sell(size=units, sl=sl, tp=tp)