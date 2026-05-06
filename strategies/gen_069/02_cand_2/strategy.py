import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session", [])
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.lower_bb = self.I(bollinger, self.data, n=20, nbdev=2).lower
        self.upper_bb = self.I(bollinger, self.data, n=20, nbdev=2).upper
        self.rsi = self.I(rsi, self.data, n=7)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour", 7)
        end_hour = rf.get("params", {}).get("end_hour", 10)
        now = pd.Timestamp(self.data.index[-1])
        if not (start_hour <= now.hour < end_hour):
            return False
        return True

    def _filters_ok(self):
        filters = self.spec.get("filters", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        max_spread = filters.get("max_spread_points")
        if max_spread is not None:
            broker_spread = self._broker_spread_points
            if not spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self):
        long_condition = self.data.Close[-1] > self.lower_bb[-1] and self.rsi[-1] < 30
        short_condition = self.data.Close[-1] < self.upper_bb[-1] and self.rsi[-1] > 70
        if long_condition and not self.position:
            self.position.entry()
            self.sl_price = self.data.Close[-1] - 2 * self.I(atr, self.data, n=14)[-1]
            self.tp_price = self.data.Close[-1] + (self.upper_bb[-1] - self.data.Close[-1])
        elif short_condition and not self.position:
            self.position.entry(short=True)
            self.sl_price = self.data.Close[-1] + 2 * self.I(atr, self.data, n=14)[-1]
            self.tp_price = self.data.Close[-1] - (self.data.Close[-1] - self.lower_bb[-1])

    def _manage_open(self):
        exit_cfg = self.spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop", {}).get("num_bars", 20)
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        atr_now = self.I(atr, self.data, n=14)[-1]
        price = float(self.data.Close[-1])
        for trade in self.trades:
            if trade.is_long and trade.pl_pct > 0:
                new_sl = price - 2 * atr_now
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl
            elif not trade.is_long and trade.pl_pct > 0:
                new_sl = price + 2 * atr_now
                if trade.sl is None or new_sl < trade.sl:
                    trade.sl = new_sl