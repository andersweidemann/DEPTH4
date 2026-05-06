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
        self._bb = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self._rsi = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self._atr = self.I(atr, self.data, 14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "bb_width_percentile":
            bb_width_val = float(self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"])[-1])
            bb_width_percentile = np.percentile(self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"]), self.spec["regime_filter"]["params"]["percentile"])
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self):
        er = self.spec["entry_rule"]
        if er["type"] == "mean_reversion":
            upper_bb = self._bb["upper"][-1]
            lower_bb = self._bb["lower"][-1]
            close = self.data.Close[-1]
            rsi = self._rsi[-1]
            if (close >= upper_bb and rsi <= er["params"]["rsi_thresholds"][0]) or (close <= lower_bb and rsi >= er["params"]["rsi_thresholds"][1]):
                lots = lots_by_risk_pct(self._equity_start, self.spec["sizing_rule"]["params"]["fraction"], self.data)
                if close >= upper_bb:
                    self.position.enter_short(lots)
                else:
                    self.position.enter_long(lots)
                self.sl_price = self.data.Close[-1] + (1.5 * self._atr[-1]) * (-1 if self.position.is_long else 1)
                self.tp_price = upper_bb if self.position.is_long else lower_bb

    def _manage_open(self):
        exit_cfg = self.spec["exit_rule"]
        time_stop = exit_cfg["params"]["time_stop"]
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if exit_cfg["params"]["tp"] == "opposite_bb":
            upper_bb = self._bb["upper"][-1]
            lower_bb = self._bb["lower"][-1]
            if self.position.is_long and self.data.Close[-1] >= upper_bb:
                self.position.close()
            elif self.position.is_short and self.data.Close[-1] <= lower_bb:
                self.position.close()