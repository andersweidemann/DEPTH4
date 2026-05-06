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
        self._bb_width_series = self.I(bb_width, self.data, n=self.spec["regime_filter"]["params"]["lookback"])
        self._bb_series = self.I(bollinger, self.data, n=self.spec["entry_rule"]["params"]["bb_period"], dev=self.spec["entry_rule"]["params"]["bb_deviation"])
        self._atr_series = self.I(atr, self.data, n=14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        bb_width_val = float(self._bb_width_series[-1])
        percentile = rf["params"]["percentile"]
        if bb_width_val > np.percentile(self._bb_width_series, percentile):
            return True
        return False

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
        bb_series = self._bb_series
        if self.position.size == 0:
            if self.data.Close[-1] <= bb_series['lower'][-1]:
                self.position.enter(long=True, size=lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] - 1.5 * self._atr_series[-1]
                self.tp_price = bb_series['upper'][-1]
            elif self.data.Close[-1] >= bb_series['upper'][-1]:
                self.position.enter(long=False, size=lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] + 1.5 * self._atr_series[-1]
                self.tp_price = bb_series['lower'][-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop", 30)
        if not self.position:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= time_stop:
            self.position.close()
            return
        atr_now = float(self._atr_series[-1])
        price = float(self.data.Close[-1])
        if self.position.is_long and self.position.pl_pct > 0:
            new_sl = price - 1.5 * atr_now
            if self.sl_price is None or new_sl > self.sl_price:
                self.sl_price = new_sl
        elif not self.position.is_long and self.position.pl_pct > 0:
            new_sl = price + 1.5 * atr_now
            if self.sl_price is None or new_sl < self.sl_price:
                self.sl_price = new_sl