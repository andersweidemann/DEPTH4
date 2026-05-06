from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _bb_lower(data, period=20, stdev=2.0):
    mid, upper, lower = signals.bollinger(data.Close, period, stdev)
    return lower


def _bb_upper(data, period=20, stdev=2.0):
    mid, upper, lower = signals.bollinger(data.Close, period, stdev)
    return upper


def _bb_middle(data, period=20, stdev=2.0):
    mid, upper, lower = signals.bollinger(data.Close, period, stdev)
    return mid


def _bb_width_series(data, period=20, stdev=2.0):
    return signals.bb_width(data.Close, period, stdev)


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                self._spec = json.loads(spec_file.read_text())
            except Exception:
                pass

        self.spec = dict(self._spec) if self._spec else {
            "name": "XAUUSD_M15_BBRSI_MeanReversion",
            "filters": {
                "session_utc": [{"start": "07:00", "end": "20:00"}],
            },
            "exit": {"time_stop_bars": 24},
            "risk": {},
        }

        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)

        # Session mask 07:00-20:00 UTC
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        sessions = [{"start": "07:00", "end": "20:00"}]
        try:
            self._session_mask_full = np.asarray(
                signals.session_mask(full_idx, sessions), dtype=bool)
        except Exception:
            self._session_mask_full = None

        self._broker_spread_points = 0

        # Indicators
        self._bb_lower = self.I(_bb_lower, self.data, 20, 2.0)
        self._bb_upper = self.I(_bb_upper, self.data, 20, 2.0)
        self._bb_middle = self.I(_bb_middle, self.data, 20, 2.0)
        self._bb_width = self.I(_bb_width_series, self.data, 20, 2.0)
        self._rsi_series = self.I(signals.rsi, self.data.Close, 7)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)

        self._last_entry_bar = -10_000
        self._trades_today = 0
        self._current_day = None

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val >= 25.0:
            return False

        # BB width percentile >= 30
        lookback = 200
        width_arr = np.asarray(self._bb_width)
        end = len(width_arr)
        start = max(0, end - lookback)
        window = width_arr[start:end]
        window = window[~np.isnan(window)]
        if len(window) < 30:
            return False
        current_w = width_arr[-1]
        if np.isnan(current_w):
            return False
        pct = (window < current_w).sum() / len(window) * 100.0
        if pct < 30.0:
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

        daily_kill_pct = self.spec.get("risk", {}).get(
            "daily_dd_kill_pct",
            config.load()["risk"]["daily_dd_kill_pct"])
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, daily_kill_pct):
            return False

        return True

    def next(self):
        if not self._regime_ok():
            self._manage_open()
            return
        if not self._filters_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()

    def _enter_if_signal(self) -> None:
        if self.position:
            return

        if self._trades_today >= 3:
            return

        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < 4:
            return

        close = float(self.data.Close[-1])
        lower = float(self._bb_lower[-1])
        upper = float(self._bb_upper[-1])
        middle = float(self._bb_middle[-1])
        rsi_v = float(self._rsi_series[-1])
        atr_v = float(self._atr_series[-1])

        if np.isnan(lower) or np.isnan(upper) or np.isnan(middle) or np.isnan(rsi_v) or np.isnan(atr_v):
            return
        if atr_v <= 0:
            return

        long_sig = close < lower and rsi_v < 12.0
        short_sig = close > upper and rsi_v > 88.0

        if not (long_sig or short_sig):
            return

        risk_pct = 0.5
        equity = float(self.equity)

        if long_sig:
            sl = close - 1.5 * atr_v
            tp_mid = middle
            tp_opp = upper
            tp = min(tp_mid, tp_opp) if tp_mid > close and tp_opp > close else max(tp_mid, tp_opp)
            if tp <= close:
                tp = middle
            if tp <= close:
                return
            risk_dist = close - sl
            if risk_dist <= 0:
                return
            reward = tp - close
            if reward / risk_dist < 1.0:
                return
            size = risk.lots_by_risk_pct(equity, risk_pct, risk_dist, self._symbol)
            if size <= 0:
                return
            try:
                units = max(1, int(size))
                self.sl_price = sl
                self.tp_price = tp
                self.buy(size=units, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
                self._trades_today += 1
            except Exception:
                return

        elif short_sig:
            sl = close + 1.5 * atr_v
            tp_mid = middle
            tp_opp = lower
            tp = max(tp_mid, tp_opp) if tp_mid < close and tp_opp < close else min(tp_mid, tp_opp)
            if tp >= close:
                tp = middle
            if tp >= close:
                return
            risk_dist = sl - close
            if risk_dist <= 0:
                return
            reward = close - tp
            if reward / risk_dist < 1.0:
                return
            size = risk.lots_by_risk_pct(equity, risk_pct, risk_dist, self._symbol)
            if size <= 0:
                return
            try:
                units = max(1, int(size))
                self.sl_price = sl
                self.tp_price = tp
                self.sell(size=units, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
                self._trades_today += 1
            except Exception:
                return

    def _manage_open(self) -> None:
        if not self.position:
            return

        time_stop = 24
        trade = self.trades[-1] if self.trades else None
        if trade is not None:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return

        middle = float(self._bb_middle[-1])
        if np.isnan(middle):
            return
        close = float(self.data.Close[-1])
        if self.position.is_long:
            if close >= middle:
                self.position.close()
        else:
            if close <= middle:
                self.position.close()