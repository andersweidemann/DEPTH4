from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        try:
            with open(spec_file, "r") as f:
                self._spec = json.load(f)
        except Exception:
            pass

        super().init()

        close = pd.Series(self.data.Close, index=self.data.df.index if hasattr(self.data, "df") else None)
        high = pd.Series(self.data.High, index=close.index)
        low = pd.Series(self.data.Low, index=close.index)

        bb_period = 20
        bb_dev = 2.0
        rsi_period = 7
        atr_period = 14
        adx_period = 14
        bbw_lookback = 200
        bbw_min_pct = 30.0

        def _bb_upper(c):
            u, m, l = signals.bollinger(pd.Series(c), bb_period, bb_dev)
            return np.asarray(u, dtype=float)

        def _bb_mid(c):
            u, m, l = signals.bollinger(pd.Series(c), bb_period, bb_dev)
            return np.asarray(m, dtype=float)

        def _bb_lower(c):
            u, m, l = signals.bollinger(pd.Series(c), bb_period, bb_dev)
            return np.asarray(l, dtype=float)

        def _bb_width(c):
            return np.asarray(signals.bb_width(pd.Series(c), bb_period), dtype=float)

        def _rsi(c):
            return np.asarray(signals.rsi(pd.Series(c), rsi_period), dtype=float)

        def _atr(h, l, c):
            return np.asarray(
                signals.atr(pd.Series(h), pd.Series(l), pd.Series(c), atr_period),
                dtype=float,
            )

        def _adx(h, l, c):
            return np.asarray(
                regime.adx(pd.Series(h), pd.Series(l), pd.Series(c), adx_period),
                dtype=float,
            )

        def _bbw_pctile(c):
            w = pd.Series(signals.bb_width(pd.Series(c), bb_period))
            pct = w.rolling(bbw_lookback, min_periods=bbw_lookback // 2).rank(pct=True) * 100.0
            return np.asarray(pct, dtype=float)

        self._bb_upper = self.I(_bb_upper, self.data.Close)
        self._bb_mid = self.I(_bb_mid, self.data.Close)
        self._bb_lower = self.I(_bb_lower, self.data.Close)
        self._bb_width_series = self.I(_bb_width, self.data.Close)
        self._rsi_series = self.I(_rsi, self.data.Close)
        self._atr_series = self.I(_atr, self.data.High, self.data.Low, self.data.Close)
        self._adx_series = self.I(_adx, self.data.High, self.data.Low, self.data.Close)
        self._bbw_pct_series = self.I(_bbw_pctile, self.data.Close)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(idx, [[7, 20]]), dtype=bool
        )

        self._adx_max = 25.0
        self._bbw_min_pct = bbw_min_pct
        self._cooldown_bars = 3
        self._last_exit_bar = -10_000
        self._time_stop_bars = 30
        self._sl_atr_mult = 1.5
        self._risk_pct = 0.5
        self._rsi_low = 10.0
        self._rsi_high = 90.0

        self._entry_bar = None

    def _regime_ok(self) -> bool:
        adx_v = float(self._adx_series[-1]) if len(self._adx_series) else np.nan
        if np.isnan(adx_v) or adx_v > self._adx_max:
            return False
        bbw_p = float(self._bbw_pct_series[-1]) if len(self._bbw_pct_series) else np.nan
        if np.isnan(bbw_p) or bbw_p < self._bbw_min_pct:
            return False
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        try:
            now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
            cfg_kill = config.load()["risk"]["daily_dd_kill_pct"]
            if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, cfg_kill):
                return False
        except Exception:
            pass
        return True

    def next(self):
        if self.position:
            self._manage_open_custom()
            return

        if len(self.data) < 210:
            return

        cur_bar = len(self.data) - 1
        if cur_bar - self._last_exit_bar < self._cooldown_bars:
            return

        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        close = float(self.data.Close[-1])
        upper = float(self._bb_upper[-1])
        lower = float(self._bb_lower[-1])
        mid = float(self._bb_mid[-1])
        rsi_v = float(self._rsi_series[-1])
        atr_v = float(self._atr_series[-1])

        if any(np.isnan(x) for x in (upper, lower, mid, rsi_v, atr_v)) or atr_v <= 0:
            return

        long_sig = close < lower and rsi_v < self._rsi_low
        short_sig = close > upper and rsi_v > self._rsi_high

        if not (long_sig or short_sig):
            return

        if long_sig:
            sl = close - self._sl_atr_mult * atr_v
            tp = mid
            if sl >= close or tp <= close:
                return
            stop_dist = close - sl
        else:
            sl = close + self._sl_atr_mult * atr_v
            tp = mid
            if sl <= close or tp >= close:
                return
            stop_dist = sl - close

        if stop_dist <= 0:
            return

        pt = risk.SYMBOL_DEFAULTS.get(self._symbol.upper(), {"point_size": 0.01})["point_size"]
        sl_points = float(stop_dist) / pt
        try:
            size = risk.lots_by_risk_pct(
                float(self.equity), sl_points, float(self._risk_pct), self._symbol,
            )
        except Exception:
            size = 0.0

        if size is None or size <= 0:
            frac = (self._risk_pct / 100.0) * self.equity / (stop_dist * max(close, 1e-9))
            frac = max(min(frac, 0.99), 0.0)
            if frac <= 0:
                return
            size = frac

        if isinstance(size, float) and 0 < size < 1:
            order_size = size
        else:
            order_size = max(int(size), 1)

        self.sl_price = sl
        self.tp_price = tp

        if long_sig:
            self.buy(size=order_size, sl=sl, tp=tp)
        else:
            self.sell(size=order_size, sl=sl, tp=tp)

        self._entry_bar = cur_bar

    def _manage_open_custom(self):
        if not self.position:
            return
        cur_bar = len(self.data) - 1
        trade = self.trades[-1] if self.trades else None
        if trade is not None:
            bars_open = cur_bar - trade.entry_bar
            if bars_open >= self._time_stop_bars:
                self.position.close()
                self._last_exit_bar = cur_bar
                return

        mid = float(self._bb_mid[-1])
        if np.isnan(mid):
            return
        close = float(self.data.Close[-1])
        if self.position.is_long and close >= mid:
            self.position.close()
            self._last_exit_bar = cur_bar
        elif self.position.is_short and close <= mid:
            self.position.close()
            self._last_exit_bar = cur_bar