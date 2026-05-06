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
        if spec_file.exists():
            try:
                self._spec = json.loads(spec_file.read_text())
            except Exception:
                pass

        # Build filter session into spec before super().init
        self._spec.setdefault("filters", {})
        self._spec["filters"]["session_utc"] = ["07:00-15:30"]
        self._spec.setdefault("exit", {})
        self._spec["exit"]["time_stop_bars"] = 32
        self._spec["exit"]["trail_atr_mult"] = 2.0

        super().init()

        # Indicators
        self._donchian_upper = self.I(
            lambda d: signals.donchian(d, 40)[0], self.data
        )
        self._donchian_lower = self.I(
            lambda d: signals.donchian(d, 40)[1], self.data
        )
        self._donchian_mid = self.I(
            lambda d: signals.donchian(d, 40)[2], self.data
        )
        self._ema_fast = self.I(signals.ema, self.data.Close, 20)
        self._ema_slow = self.I(signals.ema, self.data.Close, 100)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._atr_sma50 = self.I(signals.sma, self._atr_series, 50)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct = self.I(regime.atr_percentile, self.data, 14, 200)

        # Daily trade tracking
        self._trades_today = 0
        self._current_day = None
        self._day_start_equity = self._equity_start

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1]) if len(self._adx_series) else np.nan
        atr_pct = float(self._atr_pct[-1]) if len(self._atr_pct) else np.nan
        if np.isnan(adx_val) or np.isnan(atr_pct):
            return False
        if adx_val < 22:
            return False
        if atr_pct < 50:
            return False
        return True

    def _daily_limits_ok(self) -> bool:
        idx = self.data.index
        today = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if today != self._current_day:
            self._current_day = today
            self._trades_today = 0
            self._day_start_equity = float(self.equity)

        if self._trades_today >= 2:
            return False

        dd_pct = (self._day_start_equity - float(self.equity)) / self._day_start_equity * 100.0
        if dd_pct >= 2.0:
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if not self._daily_limits_ok():
            return

        close = float(self.data.Close[-1])
        atr_now = float(self._atr_series[-1])
        atr_sma = float(self._atr_sma50[-1])
        ema_f = float(self._ema_fast[-1])
        ema_s = float(self._ema_slow[-1])

        if np.isnan(atr_now) or np.isnan(atr_sma) or atr_now <= 0:
            return

        if len(self._donchian_upper) < 2:
            return
        up_prev = float(self._donchian_upper[-2])
        dn_prev = float(self._donchian_lower[-2])
        mid = float(self._donchian_mid[-1])

        if np.isnan(up_prev) or np.isnan(dn_prev) or np.isnan(mid):
            return

        atr_expanded = atr_now > atr_sma * 1.1
        if not atr_expanded:
            return

        long_signal = close > up_prev and ema_f > ema_s
        short_signal = close < dn_prev and ema_f < ema_s

        if not (long_signal or short_signal):
            return

        equity = float(self.equity)
        risk_pct = 0.5
        sl_dist = 1.5 * atr_now

        if long_signal:
            sl = max(close - sl_dist, mid - 0.0001)
            if sl >= close:
                return
            tp = close + 3.0 * atr_now
            size = risk.lots_by_risk_pct(equity, risk_pct, close - sl, close, self._symbol)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._trades_today += 1
            except Exception:
                pass
        elif short_signal:
            sl = min(close + sl_dist, mid + 0.0001)
            if sl <= close:
                return
            tp = close - 3.0 * atr_now
            size = risk.lots_by_risk_pct(equity, risk_pct, sl - close, close, self._symbol)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._trades_today += 1
            except Exception:
                pass

    def _manage_breakeven(self) -> None:
        if not self.trades:
            return
        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now):
            return
        price = float(self.data.Close[-1])
        for trade in self.trades:
            entry = trade.entry_price
            if trade.is_long:
                if price - entry >= 1.0 * atr_now:
                    if trade.sl is None or trade.sl < entry:
                        trade.sl = entry
            else:
                if entry - price >= 1.0 * atr_now:
                    if trade.sl is None or trade.sl > entry:
                        trade.sl = entry

    def next(self):
        if not self._regime_ok():
            self._manage_breakeven()
            self._manage_open()
            return
        if not self._filters_ok():
            self._manage_breakeven()
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_breakeven()
        self._manage_open()