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
        self.bollinger_bands = self.I(bollinger, self.data, n=20)
        self.rsi = self.I(rsi, self.data, n=7)
        self.atr = self.I(atr, self.data, n=14)
        self.bb_width = self.I(bb_width, self.data, n=20)
        self.sl_price = None
        self.tp_price = None

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "bb_width_percentile":
            threshold = rf.get("params", {}).get("threshold")
            bb_width_val = float(self.bb_width[-1])
            bb_width_percentile = np.percentile(self.bb_width, threshold)
            return bb_width_val < bb_width_percentile
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
            if long_condition and short_condition:
                close = float(self.data.Close[-1])
                lower_bb = float(self.bollinger_bands.lower[-1])
                upper_bb = float(self.bollinger_bands.upper[-1])
                rsi_val = float(self.rsi[-1])
                if close < lower_bb and rsi_val < 10:
                    self.position.enter_long(lots_by_risk_pct(self.spec, self.equity, self.data))
                    self.sl_price = close - 1.5 * float(self.atr[-1])
                    self.tp_price = upper_bb
                elif close > upper_bb and rsi_val > 90:
                    self.position.enter_short(lots_by_risk_pct(self.spec, self.equity, self.data))
                    self.sl_price = close + 1.5 * float(self.atr[-1])
                    self.tp_price = lower_bb

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if exit_cfg.get("sl", {}).get("type") == "atr":
            atr_mult = exit_cfg.get("sl", {}).get("params", {}).get("multiplier")
            atr_val = float(self.atr[-1])
            if self.position.is_long:
                self.sl_price = max(self.sl_price, float(self.data.Close[-1]) - atr_mult * atr_val)
            else:
                self.sl_price = min(self.sl_price, float(self.data.Close[-1]) + atr_mult * atr_val)
        if exit_cfg.get("tp", {}).get("type") == "opposite_bb":
            if self.position.is_long:
                self.tp_price = float(self.bollinger_bands.upper[-1])
            else:
                self.tp_price = float(self.bollinger_bands.lower[-1])