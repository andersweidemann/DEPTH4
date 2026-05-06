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
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.bb_period = self.spec["regime_filter"]["params"]["bb_period"]
        self.bb_deviation = self.spec["regime_filter"]["params"]["bb_deviation"]
        self.upper_bb, self.lower_bb = self.I(bollinger, self.data, self.bb_period, self.bb_deviation)
        self.rsi = self.I(rsi, self.data, 7)
        self.atr = self.I(atr, self.data, 14)

    def _regime_ok(self):
        bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        bb_width = self.I(bb_width, self.data, self.bb_period)
        bb_width_percentile_value = np.percentile(bb_width, bb_width_percentile)
        return bb_width[-1] > bb_width_percentile_value

    def _enter_if_signal(self):
        if self.position:
            return
        if self.spec["entry_rules"]["long"]["condition"] and self.close > self.lower_bb[-1] and self.rsi[-1] < 10:
            self.position.enter_long(lots_by_risk_pct(self.spec, self._equity_start, self.data.Close[-1]))
            self.sl_price = self.data.Close[-1] - self.atr[-1] * self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"]
            self.tp_price = self.upper_bb[-1]
        elif self.spec["entry_rules"]["short"]["condition"] and self.close < self.upper_bb[-1] and self.rsi[-1] > 90:
            self.position.enter_short(lots_by_risk_pct(self.spec, self._equity_start, self.data.Close[-1]))
            self.sl_price = self.data.Close[-1] + self.atr[-1] * self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"]
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        if not self.position:
            return
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if self.spec["exit_rules"]["stop_loss"]["type"] == "atr":
            atr_now = float(self.atr[-1])
            price = float(self.data.Close[-1])
            if self.position.is_long and self.position.pl_pct > 0:
                new_sl = price - atr_now * self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"]
                if self.position.sl is None or new_sl > self.position.sl:
                    self.position.sl = new_sl
            elif not self.position.is_long and self.position.pl_pct > 0:
                new_sl = price + atr_now * self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"]
                if self.position.sl is None or new_sl < self.position.sl:
                    self.position.sl = new_sl