import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "XAUUSD"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("start_hour", 0), self.spec.get("regime_filter", {}).get("params", {}).get("end_hour", 6)
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(session_mask(full_idx, [(sessions[0], sessions[1])]), dtype=bool)
        self._broker_spread_points = 0
        self._atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "asia_session":
            return self._session_mask_full[-1] if len(self._session_mask_full) > 0 else False
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
        entry_cfg = self.spec.get("entry_rule")
        if entry_cfg.get("type") == "range_expansion":
            atr_period = entry_cfg.get("params", {}).get("atr_period", 14)
            min_range_atr = entry_cfg.get("params", {}).get("min_range_atr", 0.5)
            max_range_atr = entry_cfg.get("params", {}).get("max_range_atr", 2.0)
            atr_now = float(self._atr_series[-1])
            high_low_range = self.data.High[-1] - self.data.Low[-1]
            range_atr = high_low_range / atr_now
            if min_range_atr <= range_atr <= max_range_atr:
                sizing_cfg = self.spec.get("sizing_rule")
                if sizing_cfg.get("type") == "fixed_fraction":
                    fraction = sizing_cfg.get("params", {}).get("fraction", 0.01)
                    lots = lots_by_risk_pct(self.equity, fraction)
                    self.position.enter(lots)
                    exit_cfg = self.spec.get("exit_rule")
                    if exit_cfg.get("type") == "tp_sl_time":
                        tp = exit_cfg.get("params", {}).get("tp", "fixed_pips")
                        sl = exit_cfg.get("params", {}).get("sl", "1.5_atr")
                        time_stop = exit_cfg.get("params", {}).get("time_stop", 30)
                        if tp == "fixed_pips":
                            self.tp_price = self.data.Close[-1] + 10
                        elif tp == "atr":
                            self.tp_price = self.data.Close[-1] + atr_now
                        if sl == "1.5_atr":
                            self.sl_price = self.data.Close[-1] - 1.5 * atr_now
                        elif sl == "2_atr":
                            self.sl_price = self.data.Close[-1] - 2 * atr_now

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("params", {}).get("time_stop", 30)
        if not self.position:
            return
        trade = self.trades[-1] if self.trades else None
        if trade is not None:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return