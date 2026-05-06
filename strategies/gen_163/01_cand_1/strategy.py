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
        self.high_asia_range = self.I(donchian, self.data, 20, 'high')
        self.low_asia_range = self.I(donchian, self.data, 20, 'low')
        self.breakout = self.I(atr_breakout_levels, self.data, 20)
        self._session_mask_full = np.asarray(session_mask(self.data.index, [7, 10]), dtype=bool)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour", 7)
        end_hour = rf.get("params", {}).get("end_hour", 10)
        current_hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= current_hour < end_hour

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
        entry_rules = self.spec.get("entry_rules")
        long_condition = entry_rules.get("long", {}).get("condition")
        short_condition = entry_rules.get("short", {}).get("condition")
        if long_condition and self.breakout[-1] > 0 and self.data.Close[-1] > self.high_asia_range[-1]:
            self.position.open(long=True, size=lots_by_risk_pct(self.equity, self.spec.get("sizing_rules", {}).get("params", {}).get("size", 0.01)))
            self.sl_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("stop_loss", {}).get("params", {}).get("distance", 100)
            self.tp_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("take_profit", {}).get("params", {}).get("distance", 500)
        elif short_condition and self.breakout[-1] < 0 and self.data.Close[-1] < self.low_asia_range[-1]:
            self.position.open(long=False, size=lots_by_risk_pct(self.equity, self.spec.get("sizing_rules", {}).get("params", {}).get("size", 0.01)))
            self.sl_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("stop_loss", {}).get("params", {}).get("distance", 100)
            self.tp_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("take_profit", {}).get("params", {}).get("distance", 500)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        trail_mult = exit_cfg.get("trail", {}).get("params", {}).get("distance")
        if trail_mult and hasattr(self, "_atr_series") and self.trades:
            atr_now = float(self._atr_series[-1])
            if not np.isnan(atr_now):
                price = float(self.data.Close[-1])
                for trade in self.trades:
                    if trade.is_long and trade.pl_pct > 0:
                        new_sl = price - trail_mult * atr_now
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                    elif not trade.is_long and trade.pl_pct > 0:
                        new_sl = price + trail_mult * atr_now
                        if trade.sl is None or new_sl < trade.sl:
                            trade.sl = new_sl