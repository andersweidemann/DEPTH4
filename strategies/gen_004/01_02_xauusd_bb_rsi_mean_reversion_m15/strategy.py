import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    bb_period = 20
    bb_stddev = 2.0
    rsi_period = 7
    rsi_long_thresh = 12
    rsi_short_thresh = 88
    sl_atr_mult = 1.5
    adx_max = 25
    adx_period = 14
    atr_period = 14
    atr_pct_lookback = 200
    atr_pct_min = 20
    atr_pct_max = 80
    bb_width_min_pct = 30
    cooldown_bars = 4
    time_stop_bars = 28
    max_spread_points = 40
    risk_per_trade_pct = 0.6

    def init(self):
        try:
            spec_file = Path(__file__).parent / self.spec_path
            if spec_file.exists():
                self._spec = json.loads(spec_file.read_text())
        except Exception:
            pass

        # Set up a spec-compatible dict for base class
        self.spec = {
            "filters": {
                "session_utc": ["06:00-20:00"],
                "max_spread_points": self.max_spread_points,
            },
            "risk": {},
            "exit": {
                "time_stop_bars": self.time_stop_bars,
            },
        }
        self._spec = self.spec

        super().init()

        # Indicators
        def _bb_mid(data, n, k):
            mid, _, _ = signals.bollinger(data.Close.s if hasattr(data.Close, 's') else pd.Series(data.Close), n, k)
            return np.asarray(mid)

        def _bb_upper(data, n, k):
            _, upper, _ = signals.bollinger(data.Close.s if hasattr(data.Close, 's') else pd.Series(data.Close), n, k)
            return np.asarray(upper)

        def _bb_lower(data, n, k):
            _, _, lower = signals.bollinger(data.Close.s if hasattr(data.Close, 's') else pd.Series(data.Close), n, k)
            return np.asarray(lower)

        self._bb_mid = self.I(_bb_mid, self.data, self.bb_period, self.bb_stddev)
        self._bb_upper = self.I(_bb_upper, self.data, self.bb_period, self.bb_stddev)
        self._bb_lower = self.I(_bb_lower, self.data, self.bb_period, self.bb_stddev)

        def _rsi(data, n):
            close = pd.Series(data.Close)
            return np.asarray(signals.rsi(close, n))

        self._rsi_series = self.I(_rsi, self.data, self.rsi_period)

        def _atr(data, n):
            return np.asarray(signals.atr(data, n))

        self._atr_series = self.I(_atr, self.data, self.atr_period)

        def _adx(data, n):
            return np.asarray(regime.adx(data, n))

        self._adx_series = self.I(_adx, self.data, self.adx_period)

        def _atr_pct(data, n, lb):
            return np.asarray(regime.atr_percentile(data, n, lb))

        self._atr_pct_series = self.I(_atr_pct, self.data, self.atr_period, self.atr_pct_lookback)

        def _bbw(data, n, k):
            close = pd.Series(data.Close)
            return np.asarray(signals.bb_width(close, n, k))

        self._bbw_series = self.I(_bbw, self.data, self.bb_period, self.bb_stddev)

        self._last_entry_bar = -10_000

    def _regime_ok(self) -> bool:
        i = len(self.data) - 1
        if i < max(self.bb_period, self.atr_pct_lookback, self.adx_period):
            return False

        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val > self.adx_max:
            return False

        atr_pct = float(self._atr_pct_series[-1])
        if np.isnan(atr_pct) or atr_pct < self.atr_pct_min or atr_pct > self.atr_pct_max:
            return False

        # BB width percentile over lookback
        bbw_arr = np.asarray(self._bbw_series)
        lookback = min(self.atr_pct_lookback, i + 1)
        window = bbw_arr[i - lookback + 1 : i + 1]
        window = window[~np.isnan(window)]
        if len(window) < 20:
            return False
        cur_bbw = float(self._bbw_series[-1])
        if np.isnan(cur_bbw):
            return False
        pct = (window < cur_bbw).sum() / len(window) * 100.0
        if pct < self.bb_width_min_pct:
            return False

        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return

        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self.cooldown_bars:
            return

        close = float(self.data.Close[-1])
        prior_low = float(self.data.Low[-2])
        prior_high = float(self.data.High[-2])

        lower = float(self._bb_lower[-1])
        upper = float(self._bb_upper[-1])
        prior_lower = float(self._bb_lower[-2])
        prior_upper = float(self._bb_upper[-2])

        rsi_val = float(self._rsi_series[-1])
        atr_val = float(self._atr_series[-1])
        mid = float(self._bb_mid[-1])

        if any(np.isnan(x) for x in (lower, upper, prior_lower, prior_upper, rsi_val, atr_val, mid)):
            return
        if atr_val <= 0:
            return

        equity = float(self.equity)
        risk_pct = self.risk_per_trade_pct

        long_sig = (close < lower) and (rsi_val < self.rsi_long_thresh) and (prior_low < prior_lower)
        short_sig = (close > upper) and (rsi_val > self.rsi_short_thresh) and (prior_high > prior_upper)

        if long_sig:
            sl = close - self.sl_atr_mult * atr_val
            tp = mid
            if sl >= close or tp <= close:
                return
            stop_dist = close - sl
            try:
                size = risk.lots_by_risk_pct(equity, risk_pct, stop_dist, close, self._symbol)
            except Exception:
                size = None
            if size is None or size <= 0:
                size = 0.01
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                try:
                    frac = max(min(float(size) / max(equity, 1.0), 0.99), 1e-4)
                    self.buy(size=frac, sl=sl, tp=tp)
                    self._last_entry_bar = bar_i
                except Exception:
                    pass

        elif short_sig:
            sl = close + self.sl_atr_mult * atr_val
            tp = mid
            if sl <= close or tp >= close:
                return
            stop_dist = sl - close
            try:
                size = risk.lots_by_risk_pct(equity, risk_pct, stop_dist, close, self._symbol)
            except Exception:
                size = None
            if size is None or size <= 0:
                size = 0.01
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                try:
                    frac = max(min(float(size) / max(equity, 1.0), 0.99), 1e-4)
                    self.sell(size=frac, sl=sl, tp=tp)
                    self._last_entry_bar = bar_i
                except Exception:
                    pass

    def _manage_open(self) -> None:
        if not self.position:
            return

        # Early exit: opposite BB touch
        upper = float(self._bb_upper[-1])
        lower = float(self._bb_lower[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])

        for trade in self.trades:
            if trade.is_long and high >= upper:
                trade.close()
                return
            if not trade.is_long and low <= lower:
                trade.close()
                return

        super()._manage_open()

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()