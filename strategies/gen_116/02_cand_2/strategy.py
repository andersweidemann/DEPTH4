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
        self._donchian_channel = self.I(donchian, self.data, 20)
        self._rsi = self.I(rsi, self.data, 7)
        self._atr = self.I(atr, self.data, 14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "donchian_channel_width":
            channel_width = self._donchian_channel[-1][1] - self._donchian_channel[-1][0]
            percentile = rf["params"]["percentile"]
            lookback = rf["params"]["lookback"]
            channel_widths = [self._donchian_channel[i][1] - self._donchian_channel[i][0] for i in range(-lookback, 0)]
            return np.percentile(channel_widths, percentile) < channel_width
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 10)):
            return False
        return True

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules.get("long", {}).get("condition")
            short_condition = entry_rules.get("short", {}).get("condition")
            if long_condition and eval(long_condition):
                self.position.enter_long()
                self.sl_price = self.data.Close[-1] - 2 * self._atr[-1]
                self.tp_price = self._donchian_channel[-1][1]
            elif short_condition and eval(short_condition):
                self.position.enter_short()
                self.sl_price = self.data.Close[-1] + 2 * self._atr[-1]
                self.tp_price = self._donchian_channel[-1][0]

    def _manage_open(self):
        exit_rules = self.spec.get("exit_rules")
        if exit_rules:
            time_stop = exit_rules.get("time_stop", {}).get("params", {}).get("num_bars")
            if time_stop is not None:
                trade = self.trades[-1] if self.trades else None
                if trade is not None:
                    bars_open = len(self.data) - trade.entry_bar
                    if bars_open >= time_stop:
                        self.position.close()
                        return
            sl_type = exit_rules.get("sl", {}).get("type")
            if sl_type == "atr":
                sl_multiplier = exit_rules.get("sl", {}).get("params", {}).get("multiplier")
                if sl_multiplier is not None:
                    self.sl_price = self.data.Close[-1] - sl_multiplier * self._atr[-1] if self.position.is_long else self.data.Close[-1] + sl_multiplier * self._atr[-1]
            tp_type = exit_rules.get("tp", {}).get("type")
            if tp_type == "middle_donchian":
                self.tp_price = self._donchian_channel[-1][0] if self.position.is_short else self._donchian_channel[-1][1]