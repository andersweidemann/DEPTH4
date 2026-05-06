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
        self._bb_width_series = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["lookback"])
        self._bollinger_series = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self._atr_series = self.I(atr, self.data, self.spec["exit_rule"]["params"].get("atr_period", 14))

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_val = float(self._bb_width_series[-1])
        percentile = rf["params"]["percentile"]
        if bb_width_val < np.percentile(self._bb_width_series, percentile):
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
        entry_rule = self.spec["entry_rule"]
        bollinger_val = self._bollinger_series[-1]
        if entry_rule["type"] == "bb_rejection":
            bb_period = entry_rule["params"]["bb_period"]
            bb_deviation = entry_rule["params"]["bb_deviation"]
            if bollinger_val > bb_deviation:
                self.position.open()
                self.sl_price = self.data.Close[-1] - self.spec["stop_loss"]["params"]["pips"] * self.data.pip
                self.tp_price = self.data.Close[-1] + self.spec["take_profit"]["params"]["pips"] * self.data.pip

    def _manage_open(self):
        exit_rule = self.spec["exit_rule"]
        if exit_rule["type"] == "opposite_bb":
            bollinger_val = self._bollinger_series[-1]
            if bollinger_val < -self.spec["entry_rule"]["params"]["bb_deviation"]:
                self.position.close()
        time_stop = self.spec["time_stop"]["params"]["bars"]
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()