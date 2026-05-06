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
        self._bb_width_series = self.I(bb_width, self.data, 20)
        self._rsi_series = self.I(rsi, self.data, 7)
        self._bollinger_series = self.I(bollinger, self.data, 20)
        self._atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "bb_width_percentile":
            bb_width_val = float(self._bb_width_series[-1])
            percentile = rf["params"]["percentile"]
            lookback = rf["params"]["lookback"]
            bb_width_percentile = np.percentile(self._bb_width_series[-lookback:], percentile)
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
        entry_rules = self.spec.get("entry_rules", {})
        long_condition = entry_rules.get("long", {}).get("condition")
        short_condition = entry_rules.get("short", {}).get("condition")
        if long_condition and short_condition:
            close = float(self.data.Close[-1])
            lower_bb = float(self._bollinger_series[-1][0])
            upper_bb = float(self._bollinger_series[-1][1])
            rsi = float(self._rsi_series[-1])
            if close < lower_bb and rsi < 10:
                self.position.open(long=True, size=lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("size", 0.1), self.equity, self.data))
                self.sl_price = close - 1.5 * float(self._atr_series[-1])
                self.tp_price = upper_bb
            elif close > upper_bb and rsi > 90:
                self.position.open(long=False, size=lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("size", 0.1), self.equity, self.data))
                self.sl_price = close + 1.5 * float(self._atr_series[-1])
                self.tp_price = lower_bb

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        tp_type = exit_cfg.get("tp", {}).get("type")
        if tp_type == "opposite_bb":
            close = float(self.data.Close[-1])
            lower_bb = float(self._bollinger_series[-1][0])
            upper_bb = float(self._bollinger_series[-1][1])
            if self.position.is_long and close > upper_bb:
                self.position.close()
            elif not self.position.is_long and close < lower_bb:
                self.position.close()
        sl_type = exit_cfg.get("sl", {}).get("type")
        if sl_type == "atr":
            sl_multiplier = exit_cfg.get("sl", {}).get("params", {}).get("multiplier", 1.5)
            close = float(self.data.Close[-1])
            atr = float(self._atr_series[-1])
            if self.position.is_long and close < self.sl_price:
                self.position.close()
            elif not self.position.is_long and close > self.sl_price:
                self.position.close()