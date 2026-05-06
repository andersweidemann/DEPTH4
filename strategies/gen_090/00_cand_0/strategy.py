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
        self.bb_period = self.spec["entry_rule"]["params"]["bb_period"]
        self.bb_deviation = self.spec["entry_rule"]["params"]["bb_deviation"]
        self.rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self.rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self.bollinger_bands = self.I(bollinger, self.data, self.bb_period, self.bb_deviation)
        self.rsi_values = self.I(rsi, self.data, self.rsi_period)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        ind = rf.get("indicator", "adx")
        if ind == "bb_width_percentile":
            bb_width_values = self.I(bb_width, self.data, self.bb_period)
            percentile = rf.get("params", {}).get("percentile")
            period = rf.get("params", {}).get("period")
            threshold = np.percentile(bb_width_values[-period:], percentile)
            return bb_width_values[-1] < threshold
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
        if not self.position:
            upper_band = self.bollinger_bands[0][-1]
            lower_band = self.bollinger_bands[1][-1]
            price = self.data.Close[-1]
            rsi = self.rsi_values[-1]
            if (price >= upper_band and rsi <= self.rsi_thresholds[0]) or (price <= lower_band and rsi >= self.rsi_thresholds[1]):
                if self._filters_ok():
                    fraction = self.spec["sizing_rule"]["params"]["fraction"]
                    lots = lots_by_risk_pct(self.equity, fraction, self.data)
                    self.position.enter(lots)
                    self.sl_price = self.data.Close[-1] - (1.5 * self.I(atr, self.data, 20)[-1]) if price > lower_band else self.data.Close[-1] + (1.5 * self.I(atr, self.data, 20)[-1])
                    self.tp_price = upper_band if price < upper_band else lower_band

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        tp = exit_cfg.get("tp")
        if tp == "opposite_bb":
            upper_band = self.bollinger_bands[0][-1]
            lower_band = self.bollinger_bands[1][-1]
            price = self.data.Close[-1]
            if (self.position.is_long and price >= upper_band) or (not self.position.is_long and price <= lower_band):
                self.position.close()