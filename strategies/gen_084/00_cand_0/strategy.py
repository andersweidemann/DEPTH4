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
        self.bollinger_bands = self.I(bollinger, self.data.Close, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self.rsi = self.I(rsi, self.data.Close, self.spec["entry_rule"]["params"]["rsi_period"])
        self.bb_width = self.I(bb_width, self.data.Close, self.spec["regime_filter"]["params"]["period"])
        self._regime_series = self.I(atr_percentile, self.data.Close, self.spec["regime_filter"]["params"]["period"])

    def _regime_ok(self):
        bb_width_val = float(self.bb_width[-1])
        percentile = np.percentile(self.bb_width, self.spec["regime_filter"]["params"]["percentile"])
        return bb_width_val < percentile

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            upper_band = self.bollinger_bands[2][-1]
            lower_band = self.bollinger_bands[0][-1]
            close_price = self.data.Close[-1]
            rsi_val = float(self.rsi[-1])
            if (close_price >= upper_band and rsi_val >= self.spec["entry_rule"]["params"]["rsi_thresholds"][1]) or (close_price <= lower_band and rsi_val <= self.spec["entry_rule"]["params"]["rsi_thresholds"][0]):
                lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data)
                self.position.open(lots)
                self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["sl_multiplier"] * self.I(atr, self.data.High, self.data.Low, self.data.Close, 20)[-1] if self.position.is_long else self.data.Close[-1] + self.spec["exit_rule"]["params"]["sl_multiplier"] * self.I(atr, self.data.High, self.data.Low, self.data.Close, 20)[-1]

    def _manage_open(self):
        if self.position:
            if self.position.is_long and self.data.Close[-1] < self.bollinger_bands[0][-1]:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] > self.bollinger_bands[2][-1]:
                self.position.close()
            time_stop = self.spec["exit_rule"]["params"]["time_stop"]
            if time_stop is not None:
                trade = self.trades[-1]
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()