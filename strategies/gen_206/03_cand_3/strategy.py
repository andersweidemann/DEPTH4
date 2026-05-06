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
        self.rsi = self.I(rsi, self.data, 7)
        self.bb = self.I(bollinger, self.data, 20, 1.75)
        self.atr = self.I(atr, self.data, 14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_val = float(self.I(bb_width, self.data, 20, 1.75)[-1])
        percentile = rf.get("params", {}).get("percentile", 40)
        bb_width_percentile = np.percentile(self.I(bb_width, self.data, 20, 1.75), percentile)
        return bb_width_val > bb_width_percentile

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
        long_condition = self.data.Close[-1] < self.bb['lower'][-1] and self.rsi[-1] < 20
        short_condition = self.data.Close[-1] > self.bb['upper'][-1] and self.rsi[-1] > 80
        if long_condition and self._regime_ok() and self._filters_ok():
            lots = lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("risk", 0.01), self.data.Close[-1], self.atr[-1])
            self.position.open_long(lots)
            self.sl_price = self.data.Close[-1] - self.atr[-1] * 1.5
            self.tp_price = self.bb['middle'][-1]
        elif short_condition and self._regime_ok() and self._filters_ok():
            lots = lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("risk", 0.01), self.data.Close[-1], self.atr[-1])
            self.position.open_short(lots)
            self.sl_price = self.data.Close[-1] + self.atr[-1] * 1.5
            self.tp_price = self.bb['middle'][-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("hours", 1)
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop * 60:
                    self.position.close()
                    return
        atr_mult = exit_cfg.get("sl", {}).get("params", {}).get("atr_multiplier", 1.5)
        if atr_mult and hasattr(self, "_atr_series") and self.trades:
            atr_now = float(self._atr_series[-1])
            if not np.isnan(atr_now):
                price = float(self.data.Close[-1])
                for trade in self.trades:
                    if trade.is_long and trade.pl_pct > 0:
                        new_sl = price - atr_mult * atr_now
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                    elif not trade.is_long and trade.pl_pct > 0:
                        new_sl = price + atr_mult * atr_now
                        if trade.sl is None or new_sl < trade.sl:
                            trade.sl = new_sl