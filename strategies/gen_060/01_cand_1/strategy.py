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
        self.asia_start = self.spec["regime_filter"]["params"]["asia_start"]
        self.asia_end = self.spec["regime_filter"]["params"]["asia_end"]
        self.london_start = self.spec["regime_filter"]["params"]["london_start"]
        self.london_end = self.spec["regime_filter"]["params"]["london_end"]
        self.range_atr_min = self.spec["entry_rule"]["params"]["range_atr_min"]
        self.range_atr_max = self.spec["entry_rule"]["params"]["range_atr_max"]
        self.breakout_atr = self.spec["entry_rule"]["params"]["breakout_atr"]
        self.target_pips = self.spec["exit_rule"]["params"]["pips"]
        self.stop_loss_pips = int(self.spec["stop_loss"]["params"]["distance"].replace(" pips", ""))
        self.time_stop_bars = self.spec["time_stop"]["params"]["bars"]
        self.size = self.spec["sizing"]["params"]["size"]
        self._session_mask_full = np.asarray(session_mask(self.data.index, [
            {"start": self.asia_start, "end": self.asia_end},
            {"start": self.london_start, "end": self.london_end}
        ]), dtype=bool)
        self._atr_series = self.I(atr, self.data, 20)

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
        if not self.position:
            atr_now = float(self._atr_series[-1])
            if atr_now > self.range_atr_min and atr_now < self.range_atr_max:
                high = float(self.data.High[-1])
                low = float(self.data.Low[-1])
                if high > low + self.breakout_atr * atr_now:
                    self.position.open(long=True, size=self.size)
                    self.sl_price = low - self.stop_loss_pips * self.data._point
                    self.tp_price = high + self.target_pips * self.data._point
                elif low < high - self.breakout_atr * atr_now:
                    self.position.open(long=False, size=self.size)
                    self.sl_price = high + self.stop_loss_pips * self.data._point
                    self.tp_price = low - self.target_pips * self.data._point

    def _manage_open(self):
        if self.position:
            if self.time_stop_bars is not None:
                trade = self.trades[-1]
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= self.time_stop_bars:
                    self.position.close()
            if self.tp_price is not None:
                if (self.position.is_long and float(self.data.Close[-1]) >= self.tp_price) or \
                   (not self.position.is_long and float(self.data.Close[-1]) <= self.tp_price):
                    self.position.close()