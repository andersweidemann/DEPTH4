import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, atr
from agents.risk import lots_by_risk_pct, DailyKillState, daily_kill_ok, spread_ok

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._bb_period = self.spec["entry_rule"]["params"]["bb_period"]
        self._bb_deviation = self.spec["entry_rule"]["params"]["bb_deviation"]
        self._touch_tolerance = self.spec["entry_rule"]["params"]["touch_tolerance"]
        self._bb = bollinger(self.data, self._bb_period, self._bb_deviation)
        self._atr = atr(self.data, 14)
        self._session_mask_full = np.asarray(signals.session_mask(self.data.index, [self.spec["regime_filter"]["params"]["session"]]), dtype=bool)

    def _regime_ok(self):
        return True

    def _filters_ok(self):
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def _enter_if_signal(self):
        bb_mid = self._bb[2]
        bb_upper = self._bb[0]
        bb_lower = self._bb[1]
        close = self.data.Close
        if close[-1] > bb_upper[-1] * (1 - self._touch_tolerance) and close[-2] <= bb_upper[-2] * (1 - self._touch_tolerance):
            self.position.enter_long(lots_by_risk_pct(self.equity, self.spec["sizing_rule"]["params"]["fraction"]))
            self.sl_price = close[-1] - float(self._atr[-1])
            self.tp_price = close[-1] + float(self._atr[-1]) * 0.5
        elif close[-1] < bb_lower[-1] * (1 + self._touch_tolerance) and close[-2] >= bb_lower[-2] * (1 + self._touch_tolerance):
            self.position.enter_short(lots_by_risk_pct(self.equity, self.spec["sizing_rule"]["params"]["fraction"]))
            self.sl_price = close[-1] + float(self._atr[-1])
            self.tp_price = close[-1] - float(self._atr[-1]) * 0.5

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("params", {}).get("conditions", [{}])[2].get("params", {}).get("bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        take_profit = exit_cfg.get("params", {}).get("conditions", [{}])[0].get("params", {}).get("target")
        stop_loss = exit_cfg.get("params", {}).get("conditions", [{}])[1].get("params", {}).get("distance")
        if take_profit and self.position.is_long and self.position.pl_pct > 0:
            if self.data.Close[-1] >= self.position.entry_price + float(self._atr[-1]) * 0.5:
                self.position.close()
        elif stop_loss and self.position.is_long and self.position.pl_pct < 0:
            if self.data.Close[-1] <= self.position.entry_price - float(self._atr[-1]):
                self.position.close()
        elif take_profit and not self.position.is_long and self.position.pl_pct > 0:
            if self.data.Close[-1] <= self.position.entry_price - float(self._atr[-1]) * 0.5:
                self.position.close()
        elif stop_loss and not self.position.is_long and self.position.pl_pct < 0:
            if self.data.Close[-1] >= self.position.entry_price + float(self._atr[-1]):
                self.position.close()