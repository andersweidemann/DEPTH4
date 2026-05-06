import json
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


def _bb_upper(close, n, k):
    mid, upper, lower = signals.bollinger(close, n, k)
    return upper


def _bb_lower(close, n, k):
    mid, upper, lower = signals.bollinger(close, n, k)
    return lower


def _bb_width_arr(close, n, k):
    return signals.bb_width(close, n, k)


def _percentile_rank(arr, window):
    arr = np.asarray(arr, dtype=float)
    out = np.full_like(arr, np.nan, dtype=float)
    for i in range(len(arr)):
        lo = max(0, i - window + 1)
        w = arr[lo:i + 1]
        w = w[~np.isnan(w)]
        if len(w) == 0 or np.isnan(arr[i]):
            continue
        out[i] = (np.sum(w <= arr[i]) / len(w)) * 100.0
    return out


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        try:
            p = Path(__file__).parent / self.spec_path
            if p.exists():
                self._spec = json.loads(p.read_text())
        except Exception:
            pass
        super().init()

        params = self._spec.get("params", {}) if self._spec else {}
        self.bb_len = int(params.get("bb_len", 20))
        self.bb_dev = float(params.get("bb_dev", 2.0))
        self.bb_width_pct_max = float(params.get("bb_width_pct_max", 20))
        self.squeeze_lookback = int(params.get("squeeze_lookback", 8))
        self.ema_len = int(params.get("ema_trend_len", 50))
        self.adx_len = int(params.get("adx_len", 14))
        self.adx_min = float(params.get("adx_min", 18))
        self.atr_len = int(params.get("atr_len", 14))
        self.atr_pct_min = float(params.get("atr_pct_min", 30))

        self._bb_upper = self.I(_bb_upper, self.data.Close, self.bb_len, self.bb_dev)
        self._bb_lower = self.I(_bb_lower, self.data.Close, self.bb_len, self.bb_dev)
        self._bb_width = self.I(_bb_width_arr, self.data.Close, self.bb_len, self.bb_dev)
        self._ema = self.I(signals.ema, self.data.Close, self.ema_len)
        self._atr_series = self.I(signals.atr, self.data, self.atr_len)
        self._adx_series = self.I(regime.adx, self.data, self.adx_len)
        self._atr_pct = self.I(regime.atr_percentile, self.data, self.atr_len, 100)
        self._bb_width_pct = self.I(_percentile_rank, self._bb_width, 100)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        hours = pd.to_datetime(idx).hour
        self._session_mask_full = (hours >= 7) & (hours < 16)

        self._last_exit_bar = -10_000
        self.cooldown_bars = int(self._spec.get("sizing", {}).get("cooldown_bars", 4)) if self._spec else 4
        self.risk_pct = float(self._spec.get("sizing", {}).get("risk_pct", 0.75)) if self._spec else 0.75

    def _session_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is None:
            return True
        if 0 <= bar_i < len(mask):
            return bool(mask[bar_i])
        return False

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 2:
            return False
        adx_now = float(self._adx_series[-1])
        adx_prev = float(self._adx_series[-2])
        if np.isnan(adx_now) or np.isnan(adx_prev):
            return False
        if adx_now < self.adx_min:
            return False
        if adx_now <= adx_prev:
            return False
        atr_p = float(self._atr_pct[-1])
        if np.isnan(atr_p) or atr_p < self.atr_pct_min:
            return False
        return True

    def _filters_ok(self) -> bool:
        if not self._session_ok():
            return False
        return True

    def _had_squeeze(self) -> bool:
        lb = self.squeeze_lookback
        if len(self._bb_width_pct) < lb:
            return False
        recent = np.asarray(self._bb_width_pct[-lb:], dtype=float)
        recent = recent[~np.isnan(recent)]
        if len(recent) == 0:
            return False
        return bool(np.any(recent < self.bb_width_pct_max))

    def next(self):
        if self.position:
            self._manage_open()
            return

        if (len(self.data) - 1) - self._last_exit_bar < self.cooldown_bars:
            return

        if not self._filters_ok():
            return
        if not self._regime_ok():
            return
        if not self._had_squeeze():
            return

        close = float(self.data.Close[-1])
        upper = float(self._bb_upper[-1])
        lower = float(self._bb_lower[-1])
        ema = float(self._ema[-1])
        atr_now = float(self._atr_series[-1])

        if np.isnan(upper) or np.isnan(lower) or np.isnan(ema) or np.isnan(atr_now) or atr_now <= 0:
            return

        long_sig = close > upper and close > ema
        short_sig = close < lower and close < ema

        if not (long_sig or short_sig):
            return

        sl_dist = 1.5 * atr_now
        tp_dist = 3.0 * atr_now

        if long_sig:
            sl = close - sl_dist
            tp = close + tp_dist
            lots = risk.lots_by_risk_pct(self.equity, self.risk_pct, sl_dist, self._symbol)
            if lots <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.buy(size=lots, sl=sl, tp=tp)
        elif short_sig:
            sl = close + sl_dist
            tp = close - tp_dist
            lots = risk.lots_by_risk_pct(self.equity, self.risk_pct, sl_dist, self._symbol)
            if lots <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.sell(size=lots, sl=sl, tp=tp)

    def _manage_open(self):
        if not self.position:
            return

        time_stop = 24
        trade = self.trades[-1] if self.trades else None
        if trade is not None:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self._last_exit_bar = len(self.data) - 1
                self.position.close()
                return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return
        price = float(self.data.Close[-1])

        for trade in self.trades:
            entry = trade.entry_price
            if trade.is_long:
                profit = price - entry
                if profit >= 1.5 * atr_now:
                    new_sl = price - 2.0 * atr_now
                    be = entry
                    candidate = max(new_sl, be)
                    if trade.sl is None or candidate > trade.sl:
                        trade.sl = candidate
            else:
                profit = entry - price
                if profit >= 1.5 * atr_now:
                    new_sl = price + 2.0 * atr_now
                    be = entry
                    candidate = min(new_sl, be)
                    if trade.sl is None or candidate < trade.sl:
                        trade.sl = candidate

        if not self.position and self.trades == []:
            self._last_exit_bar = len(self.data) - 1