import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, session_mask
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("start_hour", 8), self.spec.get("regime_filter", {}).get("params", {}).get("end_hour", 17)
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, [(sessions[0], sessions[1])]), dtype=bool)
        else:
            self._session_mask_full = None
        
        self._broker_spread_points = 0
        
        bb_period = self.spec.get("entry_rule", {}).get("params", {}).get("bb_period", 20)
        bb_deviation = self.spec.get("entry_rule", {}).get("params", {}).get("bb_deviation", 2.0)
        self._bb_series = bollinger(self.data, n=bb_period, deviation=bb_deviation)
        
        fraction = self.spec.get("sizing_rule", {}).get("params", {}).get("fraction", 0.01)
        self._lots = lots_by_risk_pct(fraction, self._equity_start)
        
    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        
        start_hour = rf.get("params", {}).get("start_hour", 8)
        end_hour = rf.get("params", {}).get("end_hour", 17)
        now_hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= now_hour <= end_hour
    
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
        bb_touch_tolerance = self.spec.get("entry_rule", {}).get("params", {}).get("touch_tolerance", 0.2)
        if self._bb_series[-1] is not None:
            bb_lower = self._bb_series[-1][0]
            bb_upper = self._bb_series[-1][1]
            close = self.data.Close[-1]
            if close <= bb_lower * (1 + bb_touch_tolerance) or close >= bb_upper * (1 - bb_touch_tolerance):
                self.position.enter(self._lots)
                self.sl_price = bb_lower if close <= bb_lower * (1 + bb_touch_tolerance) else bb_upper
                self.tp_price = bb_upper if close <= bb_lower * (1 + bb_touch_tolerance) else bb_lower
    
    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop", 90)
        if not self.position:
            return
        
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        
        tp = exit_cfg.get("tp", "opposite_bb")
        sl = exit_cfg.get("sl", "fixed_pips")
        if tp == "opposite_bb" and self._bb_series[-1] is not None:
            bb_lower = self._bb_series[-1][0]
            bb_upper = self._bb_series[-1][1]
            close = self.data.Close[-1]
            if close <= bb_lower and self.position.is_long:
                self.position.close()
            elif close >= bb_upper and not self.position.is_long:
                self.position.close()