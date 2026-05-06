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
        self._bb = self.I(bollinger, self.data.Close, n=self.spec["entry_rule"]["params"]["bb_period"], dev=self.spec["entry_rule"]["params"]["bb_deviation"])
        self._rsi = self.I(rsi, self.data.Close, n=self.spec["entry_rule"]["params"]["rsi_period"])
        self._bb_width = self.I(bb_width, self.data.Close, n=self.spec["regime_filter"]["params"]["lookback"])
        self._atr = self.I(atr, self.data.High, self.data.Low, self.data.Close, n=self.spec["sl_rule"]["params"]["atr_period"])

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_val = float(self._bb_width[-1])
        bb_width_percentile = np.percentile(self._bb_width, self.spec["regime_filter"]["params"]["percentile"])
        return bb_width_val <= bb_width_percentile

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
        bb = self._bb
        rsi = self._rsi
        if self.position:
            return
        if self._filters_ok() and self._regime_ok():
            if rsi[-1] < self.spec["entry_rule"]["params"]["rsi_thresholds"][0] and self.data.Close[-1] <= bb["lower"][-1]:
                self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._atr[-1]))
                self.sl_price = self.data.Close[-1] - self.spec["sl_rule"]["params"]["atr_multiplier"] * self._atr[-1]
                self.tp_price = self.data.Close[-1] + self.spec["tp_rule"]["params"]["ratio"] * (self.data.Close[-1] - self.sl_price)
            elif rsi[-1] > self.spec["entry_rule"]["params"]["rsi_thresholds"][1] and self.data.Close[-1] >= bb["upper"][-1]:
                self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._atr[-1]))
                self.sl_price = self.data.Close[-1] + self.spec["sl_rule"]["params"]["atr_multiplier"] * self._atr[-1]
                self.tp_price = self.data.Close[-1] - self.spec["tp_rule"]["params"]["ratio"] * (self.sl_price - self.data.Close[-1])

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = self.spec.get("time_stop", 0)
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        if exit_cfg.get("type") == "opposite_bb":
            bb = self._bb
            if self.position.is_long and self.data.Close[-1] >= bb["upper"][-1]:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= bb["lower"][-1]:
                self.position.close()