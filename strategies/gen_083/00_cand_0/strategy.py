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
        self.bb_period = self.spec["regime_filter"]["params"]["bb_period"]
        self.bb_deviation = self.spec["regime_filter"]["params"]["bb_deviation"]
        self.rsi_period = 7
        self.atr_period = self.spec["exit_rules"]["stop_loss"]["params"]["atr_period"]
        self.atr_multiplier = self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"]
        self.bollinger_bands = self.I(bollinger, self.data.Close, self.bb_period, self.bb_deviation)
        self.rsi = self.I(rsi, self.data.Close, self.rsi_period)
        self.atr = self.I(atr, self.data.High, self.data.Low, self.data.Close, self.atr_period)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_percentile = rf.get("type")
        if bb_width_percentile == "bb_width_percentile":
            bb_width = self.I(bb_width, self.data.Close, self.bb_period)
            percentile = rf.get("params").get("percentile")
            bb_width_percentile_value = np.percentile(bb_width, percentile)
            current_bb_width = bb_width[-1]
            return current_bb_width > bb_width_percentile_value
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0)):
            return False
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        long_condition = self.data.Close[-1] < self.bollinger_bands[2][-1] and self.rsi[-1] < 10
        short_condition = self.data.Close[-1] > self.bollinger_bands[0][-1] and self.rsi[-1] > 90
        if long_condition:
            self.position.open(long=True, size=lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.equity, self.data.Close[-1]))
            self.sl_price = self.data.Close[-1] - self.atr_multiplier * self.atr[-1]
            self.tp_price = self.bollinger_bands[0][-1]
        elif short_condition:
            self.position.open(long=False, size=lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.equity, self.data.Close[-1]))
            self.sl_price = self.data.Close[-1] + self.atr_multiplier * self.atr[-1]
            self.tp_price = self.bollinger_bands[2][-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        stop_loss = exit_cfg.get("stop_loss", {}).get("type")
        if stop_loss == "atr":
            atr_now = float(self.atr[-1])
            if not np.isnan(atr_now):
                price = float(self.data.Close[-1])
                if self.position.is_long and self.position.pl_pct > 0:
                    new_sl = price - self.atr_multiplier * atr_now
                    if self.position.sl is None or new_sl > self.position.sl:
                        self.position.sl = new_sl
                elif not self.position.is_long and self.position.pl_pct > 0:
                    new_sl = price + self.atr_multiplier * atr_now
                    if self.position.sl is None or new_sl < self.position.sl:
                        self.position.sl = new_sl