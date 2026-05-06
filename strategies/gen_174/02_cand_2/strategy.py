import numpy as np
import pandas as pd
from agents import signals, regime, risk
from agents.backtester import RegimeStrategy

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self._bb_width_series = self.I(signals.bb_width, self.data, self.spec["regime_filter"]["params"]["period"])
        self._bb_series = self.I(signals.bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self._atr_series = self.I(signals.atr, self.data, self.spec["exit_rule"]["params"]["time_stop_bars"])

    def _regime_ok(self):
        bb_width = float(self._bb_width_series[-1])
        percentile = self.spec["regime_filter"]["params"]["percentile"]
        return bb_width <= np.percentile(self._bb_width_series, percentile)

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        bb = self._bb_series
        if bb is not None:
            bb_low = bb[:, 0]
            bb_high = bb[:, 2]
            close = self.data.Close
            if close[-1] <= bb_low[-1] or close[-1] >= bb_high[-1]:
                fraction = self.spec["sizing_rule"]["params"]["fraction"]
                lots = risk.lots_by_risk_pct(self.equity, fraction, self.spec.get("risk", {}))
                sl_multiplier = self.spec["exit_rule"]["params"]["sl_multiplier"]
                atr = float(self._atr_series[-1])
                self.sl_price = close[-1] - sl_multiplier * atr if close[-1] > bb_high[-1] else close[-1] + sl_multiplier * atr
                self.position.enter(lots)

    def _manage_open(self):
        time_stop_bars = self.spec["exit_rule"]["params"]["time_stop_bars"]
        if time_stop_bars is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop_bars:
                    self.position.close()
        bb = self._bb_series
        if bb is not None:
            bb_low = bb[:, 0]
            bb_high = bb[:, 2]
            close = self.data.Close
            if close[-1] < bb_low[-1] and self.position.is_long:
                self.position.close()
            elif close[-1] > bb_high[-1] and not self.position.is_long:
                self.position.close()