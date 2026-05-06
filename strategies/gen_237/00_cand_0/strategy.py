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
        self._bb = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self._rsi = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self._bb_width = self.I(bb_width, self.data, self.spec["entry_rule"]["params"]["bb_period"])
        self._atr = self.I(atr, self.data, self.spec["exit_rule"]["params"]["time_stop_bars"])
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        bb_width_now = float(self._bb_width[-1])
        bb_width_history = self._bb_width[:-1]
        percentile_value = np.percentile(bb_width_history, bb_width_percentile)
        if bb_width_now < percentile_value:
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
        if self.position:
            return
        if not self._regime_ok() or not self._filters_ok():
            return
        bb_lower = self._bb[2]
        bb_upper = self._bb[1]
        close = self.data.Close[-1]
        if close < bb_lower or close > bb_upper:
            rsi_now = float(self._rsi[-1])
            if (close < bb_lower and rsi_now < self.spec["entry_rule"]["params"]["rsi_thresholds"][0]) or \
               (close > bb_upper and rsi_now > self.spec["entry_rule"]["params"]["rsi_thresholds"][1]):
                self.sl_price = close - self.spec["exit_rule"]["params"]["sl_multiplier"] * float(self._atr[-1]) if close > bb_upper else \
                                close + self.spec["exit_rule"]["params"]["sl_multiplier"] * float(self._atr[-1])
                lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data)
                self.position.enter(lots)

    def _manage_open(self):
        if not self.position:
            return
        time_stop = self.spec["exit_rule"]["params"]["time_stop_bars"]
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        bb_lower = self._bb[2]
        bb_upper = self._bb[1]
        close = self.data.Close[-1]
        if close < bb_lower or close > bb_upper:
            self.position.close()
            return