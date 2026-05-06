import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _bb_upper(data, n, k):
    mid, upper, lower = signals.bollinger(data, n, k)
    return upper


def _bb_mid(data, n, k):
    mid, upper, lower = signals.bollinger(data, n, k)
    return mid


def _bb_lower(data, n, k):
    mid, upper, lower = signals.bollinger(data, n, k)
    return lower


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    bb_period = 20
    bb_std = 2.0
    bbw_lookback = 500
    rsi_period = 2
    atr_period = 14
    adx_period = 14
    adx_max = 25.0
    bbw_pct_min = 30.0
    risk_pct = 0.4
    time_stop_bars = 30
    cooldown_bars = 6
    sl_atr_mult = 1.5

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                self._spec = json.loads(spec_file.read_text())
            except Exception:
                self._spec = {}
        super().init()

        self._bb_upper = self.I(_bb_upper, self.data, self.bb_period, self.bb_std)
        self._bb_mid = self.I(_bb_mid, self.data, self.bb_period, self.bb_std)
        self._bb_lower = self.I(_bb_lower, self.data, self.bb_period, self.bb_std)
        self._bbw_series = self.I(signals.bb_width, self.data, self.bb_period, self.bb_std)
        self._rsi_series = self.I(signals.rsi, self.data, self.rsi_period)
        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._adx_series = self.I(regime.adx, self.data, self.adx_period)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(idx, ["13:30-20:00"]), dtype=bool
        )

        self._last_exit_bar = -10_000

    def _regime_ok(self) -> bool:
        i = len(self.data) - 1
        if i < max(self.bb_period, self.adx_period, self.atr_period) + 2:
            return False

        mask = self._session_mask_full
        if mask is not None and 0 <= i < len(mask):
            if not bool(mask[i]):
                return False

        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val > self.adx_max:
            return False

        bbw = np.asarray(self._bbw_series)
        start = max(0, i - self.bbw_lookback + 1)
        window = bbw[start:i + 1]
        window = window[~np.isnan(window)]
        if len(window) < 30:
            return False
        cur = float(bbw[i])
        if np.isnan(cur):
            return False
        pct = float((window <= cur).sum()) / float(len(window)) * 100.0
        if pct < self.bbw_pct_min:
            return False

        return True

    def _filters_ok(self) -> bool:
        now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        dd_kill_pct = self.spec.get("risk", {}).get(
            "daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"]
        )
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill_pct):
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        i = len(self.data) - 1
        if i - self._last_exit_bar < self.cooldown_bars:
            return

        close = float(self.data.Close[-1])
        prev_close = float(self.data.Close[-2])
        bb_u = float(self._bb_upper[-1])
        bb_l = float(self._bb_lower[-1])
        bb_u_prev = float(self._bb_upper[-2])
        bb_l_prev = float(self._bb_lower[-2])
        rsi_v = float(self._rsi_series[-1])
        atr_v = float(self._atr_series[-1])

        if any(np.isnan(x) for x in (close, prev_close, bb_u, bb_l, rsi_v, atr_v)):
            return
        if atr_v <= 0:
            return

        long_sig = (close < bb_l) and (prev_close < bb_l_prev) and (rsi_v < 5.0)
        short_sig = (close > bb_u) and (prev_close > bb_u_prev) and (rsi_v > 95.0)

        if not (long_sig or short_sig):
            return

        if long_sig:
            sl = close - self.sl_atr_mult * atr_v
            tp = float(self._bb_mid[-1])
            if sl >= close or tp <= close:
                return
            stop_dist = close - sl
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                stop_distance=stop_dist,
                price=close,
            )
            if size is None or size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                if isinstance(size, float) and 0 < size < 1:
                    self.buy(size=size, sl=sl, tp=tp)
                else:
                    units = max(1, int(size))
                    self.buy(size=units, sl=sl, tp=tp)
            except Exception:
                return
        else:
            sl = close + self.sl_atr_mult * atr_v
            tp = float(self._bb_mid[-1])
            if sl <= close or tp >= close:
                return
            stop_dist = sl - close
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                stop_distance=stop_dist,
                price=close,
            )
            if size is None or size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                if isinstance(size, float) and 0 < size < 1:
                    self.sell(size=size, sl=sl, tp=tp)
                else:
                    units = max(1, int(size))
                    self.sell(size=units, sl=sl, tp=tp)
            except Exception:
                return

    def _manage_open(self) -> None:
        if not self.position:
            return

        if self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            bb_mid_now = float(self._bb_mid[-1])
            if not np.isnan(bb_mid_now):
                price = float(self.data.Close[-1])
                if trade.is_long and price >= bb_mid_now:
                    self.position.close()
                    self._last_exit_bar = len(self.data) - 1
                    return
                if (not trade.is_long) and price <= bb_mid_now:
                    self.position.close()
                    self._last_exit_bar = len(self.data) - 1
                    return
            if bars_open >= self.time_stop_bars:
                self.position.close()
                self._last_exit_bar = len(self.data) - 1
                return

    def next(self):
        if self.position:
            self._manage_open()
            if not self.position and self.trades == []:
                self._last_exit_bar = len(self.data) - 1
            return

        if not self._regime_ok():
            return
        if not self._filters_ok():
            return
        self._enter_if_signal()