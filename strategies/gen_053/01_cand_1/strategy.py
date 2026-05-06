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
        sessions = self.spec.get("regime_filter", {}).get("session", [])
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.asia_session_high = self.I(donchian, self.data, period="asia_session", direction="high")
        self.asia_session_low = self.I(donchian, self.data, period="asia_session", direction="low")
        self.atr = self.I(atr, self.data, n=14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "session":
            start_hour = rf["start_hour"]
            end_hour = rf["end_hour"]
            current_hour = pd.Timestamp(self.data.index[-1]).hour
            return start_hour <= current_hour < end_hour
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
        if entry_cfg["type"] == "breakout":
            range_period = entry_cfg["range_period"]
            displacement_threshold = entry_cfg["displacement_threshold"]
            if range_period == "asia_session":
                high = self.asia_session_high[-1]
                low = self.asia_session_low[-1]
                close = self.data.Close[-1]
                if close > high * (1 + displacement_threshold / 100):
                    self.position.enter_long(lots_by_risk_pct(self.spec, self.data))
                    self.sl_price = low - displacement_threshold * self.atr[-1]
                    self.tp_price = close + 50 * self.data._pip
                elif close < low * (1 - displacement_threshold / 100):
                    self.position.enter_short(lots_by_risk_pct(self.spec, self.data))
                    self.sl_price = high + displacement_threshold * self.atr[-1]
                    self.tp_price = close - 50 * self.data._pip

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule")
        time_stop = self.spec.get("time_stop")
        if not self.position:
            return
        if time_stop["type"] == "fixed" and time_stop["bars"] is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop["bars"]:
                self.position.close()
                return
        if exit_cfg["type"] == "take_profit" and exit_cfg["target"] == "fixed_pips":
            pips = exit_cfg["pips"]
            if self.position.is_long and self.data.Close[-1] >= self.position.entry_price + pips * self.data._pip:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.position.entry_price - pips * self.data._pip:
                self.position.close()