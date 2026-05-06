import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger_bands = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])

    def _regime_ok(self):
        return True

    def _filters_ok(self):
        filters = self.spec.get("filters", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
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
        bb_touch = self.spec["regime_filter"]["type"] == "bb_touch"
        bb_bounce = self.spec["entry_rule"]["type"] == "bb_bounce"
        if bb_touch and bb_bounce:
            lower_band = self.bollinger_bands[-1][0]
            upper_band = self.bollinger_bands[-1][1]
            close_price = self.data.Close[-1]
            if close_price < lower_band or close_price > upper_band:
                if close_price < lower_band and self.data.Close[-2] > lower_band:
                    self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data))
                    self.sl_price = close_price - self.spec["exit_rule"]["params"]["sl_multiplier"] * self.bb_width[-1]
                    self.tp_price = close_price + self.spec["exit_rule"]["params"]["sl_multiplier"] * self.bb_width[-1]
                elif close_price > upper_band and self.data.Close[-2] < upper_band:
                    self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data))
                    self.sl_price = close_price + self.spec["exit_rule"]["params"]["sl_multiplier"] * self.bb_width[-1]
                    self.tp_price = close_price - self.spec["exit_rule"]["params"]["sl_multiplier"] * self.bb_width[-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        sl_multiplier = exit_cfg.get("sl_multiplier")
        if sl_multiplier:
            atr_now = self.I(signals.atr, self.data, 14)[-1]
            price = float(self.data.Close[-1])
            for trade in self.trades:
                if trade.is_long and trade.pl_pct > 0:
                    new_sl = price - sl_multiplier * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
                elif not trade.is_long and trade.pl_pct > 0:
                    new_sl = price + sl_multiplier * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl