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
        self.bollinger_bands = self.I(bollinger, self.data, n=20, deviation=1.75)
        self.rsi = self.I(rsi, self.data, n=7)
        self.bb_width = self.I(bb_width, self.data, n=20, deviation=1.75)
        self.atr = self.I(atr, self.data, n=20)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_percentile = rf.get("percentile")
        if bb_width_percentile is not None:
            bb_width_now = float(self.bb_width[-1])
            bb_width_percentile_val = np.percentile(self.bb_width, bb_width_percentile)
            if bb_width_now < bb_width_percentile_val:
                return False
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self):
        er = self.spec.get("entry_rule")
        if er.get("type") == "mean_reversion":
            bb_period = er.get("params", {}).get("bb_period")
            bb_deviation = er.get("params", {}).get("bb_deviation")
            rsi_period = er.get("params", {}).get("rsi_period")
            rsi_thresholds = er.get("params", {}).get("rsi_thresholds")
            if self.rsi[-1] < rsi_thresholds[0] and self.data.Close[-1] < self.bollinger_bands[-1][0]:
                self.position.enter_long(lots_by_risk_pct(self.spec, self.data, self._symbol, self._equity_start))
                self.sl_price = self.data.Close[-1] - 1.5 * self.atr[-1]
                self.tp_price = self.bollinger_bands[-1][1]
            elif self.rsi[-1] > rsi_thresholds[1] and self.data.Close[-1] > self.bollinger_bands[-1][1]:
                self.position.enter_short(lots_by_risk_pct(self.spec, self.data, self._symbol, self._equity_start))
                self.sl_price = self.data.Close[-1] + 1.5 * self.atr[-1]
                self.tp_price = self.bollinger_bands[-1][0]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("params", {}).get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        take_profit = exit_cfg.get("params", {}).get("take_profit")
        stop_loss = exit_cfg.get("params", {}).get("stop_loss")
        if take_profit == "opposite_bollinger_band":
            if self.position.is_long and self.data.Close[-1] >= self.bollinger_bands[-1][1]:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.bollinger_bands[-1][0]:
                self.position.close()
        if stop_loss == "1.5x_atr":
            if self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()