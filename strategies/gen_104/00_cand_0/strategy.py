import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, rsi, bb_width, session_mask
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
        self._bb_series = self.I(bollinger, self.data, n=self.spec["entry_rule"]["params"]["bb_period"], dev=self.spec["entry_rule"]["params"]["bb_deviation"])
        self._rsi_series = self.I(rsi, self.data, n=self.spec["entry_rule"]["params"]["rsi_period"])
        self._bb_width_series = self.I(bb_width, self.data, n=self.spec["regime_filter"]["params"]["lookback"])
        self._atr_series = self.I(signals.atr, self.data, n=14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_percentile = rf.get("percentile")
        bb_width_now = float(self._bb_width_series[-1])
        bb_width_history = self._bb_width_series[:-1]
        if len(bb_width_history) < rf.get("lookback"):
            return False
        bb_width_threshold = np.percentile(bb_width_history[-rf.get("lookback"):], bb_width_percentile)
        return bb_width_now < bb_width_threshold

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
        bb = self._bb_series
        rsi = self._rsi_series
        if len(bb) < 2 or len(rsi) < 1:
            return
        bb_now = bb[-1]
        rsi_now = rsi[-1]
        bb_upper = bb_now["upper"]
        bb_lower = bb_now["lower"]
        close = self.data.Close[-1]
        if (close >= bb_upper and rsi_now <= self.spec["entry_rule"]["params"]["rsi_thresholds"][0]) or (close <= bb_lower and rsi_now >= self.spec["entry_rule"]["params"]["rsi_thresholds"][1]):
            size = lots_by_risk_pct(self.equity, self.spec["sizing_rule"]["params"]["fraction"], self.data)
            if close >= bb_upper:
                self.position.enter_short(size)
            else:
                self.position.enter_long(size)
            atr_now = float(self._atr_series[-1]) if not np.isnan(self._atr_series[-1]) else 0
            sl_pips = self.spec["exit_rule"]["params"]["sl"] * atr_now
            if close >= bb_upper:
                self.sl_price = close + sl_pips
                self.tp_price = bb_now["lower"]
            else:
                self.sl_price = close - sl_pips
                self.tp_price = bb_now["upper"]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        tp = exit_cfg.get("tp")
        if tp == "opposite_bb":
            bb_now = self._bb_series[-1]
            if self.position.is_long and self.data.Close[-1] >= bb_now["upper"]:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= bb_now["lower"]:
                self.position.close()