import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, session_mask
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {})
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, [sessions]), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.bb_period = self.spec["entry_rule"]["params"]["bb_period"]
        self.bb_deviation = self.spec["entry_rule"]["params"]["bb_deviation"]
        self.tp = self.spec["exit_rule"]["params"]["tp"]
        self.sl = self.spec["exit_rule"]["params"]["sl"]
        self.time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        self.fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self.I_bollinger = self.I(bollinger, self.data.Close, self.bb_period, self.bb_deviation)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start = rf["params"]["start"]
        end = rf["params"]["end"]
        now = pd.Timestamp(self.data.index[-1]).strftime("%H:%M")
        return start <= now <= end

    def _filters_ok(self):
        return self._regime_ok() and self._session_mask_full is None or self._session_mask_full[-1]

    def _enter_if_signal(self):
        if not self.position:
            bb_touch = self.I_bollinger[-1] == self.data.Close[-1]
            if bb_touch:
                lots = lots_by_risk_pct(self._equity_start, self.fraction, self.data.Close[-1])
                self.position.enter(lots)
                self.sl_price = self.data.Close[-1] - self.sl
                self.tp_price = self.data.Close[-1] + self.tp

    def _manage_open(self):
        if self.position:
            if self.time_stop is not None:
                trade = self.trades[-1]
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= self.time_stop:
                    self.position.close()
            else:
                self.position.close()