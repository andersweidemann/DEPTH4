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
        self._donchian_channel_high = self.I(signals.donchian, self.data, self.spec["entry_rules"]["long"]["params"]["donchian_channel_period"])
        self._donchian_channel_low = self.I(signals.donchian, self.data, self.spec["entry_rules"]["long"]["params"]["donchian_channel_period"])
        self._adx_series = self.I(adx, self.data, self.spec["entry_rules"]["long"]["params"]["adx_period"])
        self._adx_percentile = self.I(atr_percentile, self.data, self.spec["regime_filter"]["params"]["period"], self.spec["regime_filter"]["params"]["percentile"])
        self._broker_spread_points = 0
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        adx_val = float(self._adx_series[-1])
        adx_percentile_val = float(self._adx_percentile[-1])
        if np.isnan(adx_val) or np.isnan(adx_percentile_val):
            return False
        if adx_val > adx_percentile_val:
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
        if self._regime_ok() and self._filters_ok():
            close = float(self.data.Close[-1])
            if close > self._donchian_channel_high[-1] and self._adx_series[-1] > self._adx_percentile[-1]:
                self.position.enter_long()
                self.sl_price = close - self.spec["exit_rules"]["sl"]["params"]["distance"]
                self.tp_price = close + self.spec["exit_rules"]["tp"]["params"]["distance"]
            elif close < self._donchian_channel_low[-1] and self._adx_series[-1] > self._adx_percentile[-1]:
                self.position.enter_short()
                self.sl_price = close + self.spec["exit_rules"]["sl"]["params"]["distance"]
                self.tp_price = close - self.spec["exit_rules"]["tp"]["params"]["distance"]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        sl_distance = exit_cfg.get("sl", {}).get("params", {}).get("distance")
        tp_distance = exit_cfg.get("tp", {}).get("params", {}).get("distance")
        if self.position.is_long:
            self.sl_price = self.position.entry_price - sl_distance
            self.tp_price = self.position.entry_price + tp_distance
        else:
            self.sl_price = self.position.entry_price + sl_distance
            self.tp_price = self.position.entry_price - tp_distance