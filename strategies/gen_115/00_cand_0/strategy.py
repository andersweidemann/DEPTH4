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
        self._bb_series = self.I(bollinger, self.data, 20, 1.75)
        self._rsi_series = self.I(rsi, self.data, 7)
        self._atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "bb_width_percentile":
            bb_width_val = float(self.I(bb_width, self.data, 20)[-1])
            percentile = rf["params"]["percentile"]
            if bb_width_val < np.percentile(self.I(bb_width, self.data, 20), percentile):
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.1)):
            return False
        return True

    def _enter_if_signal(self):
        entry_cfg = self.spec.get("entry_rules")
        if entry_cfg:
            long_condition = entry_cfg["long"]["condition"]
            short_condition = entry_cfg["short"]["condition"]
            if long_condition == "close < lower_bb && rsi(7) < 10":
                if self.data.Close[-1] < self._bb_series.lower[-1] and self._rsi_series[-1] < 10:
                    self.position.open_long(lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("fraction", 0.01), self._atr_series[-1]))
                    self.sl_price = self.data.Close[-1] - 1.5 * self._atr_series[-1]
                    self.tp_price = self._bb_series.upper[-1]
            elif short_condition == "close > upper_bb && rsi(7) > 90":
                if self.data.Close[-1] > self._bb_series.upper[-1] and self._rsi_series[-1] > 90:
                    self.position.open_short(lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("fraction", 0.01), self._atr_series[-1]))
                    self.sl_price = self.data.Close[-1] + 1.5 * self._atr_series[-1]
                    self.tp_price = self._bb_series.lower[-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        if exit_cfg:
            time_stop = exit_cfg.get("time_stop", {}).get("num_bars")
            if time_stop is not None:
                trade = self.trades[-1] if self.trades else None
                if trade is not None:
                    bars_open = len(self.data) - trade.entry_bar
                    if bars_open >= time_stop:
                        self.position.close()
            stop_loss = exit_cfg.get("stop_loss", {}).get("type")
            if stop_loss == "atr":
                atr_mult = exit_cfg["stop_loss"]["params"]["multiplier"]
                if self.position.is_long:
                    new_sl = self.data.Close[-1] - atr_mult * self._atr_series[-1]
                    if self.sl_price is None or new_sl > self.sl_price:
                        self.sl_price = new_sl
                elif not self.position.is_long:
                    new_sl = self.data.Close[-1] + atr_mult * self._atr_series[-1]
                    if self.sl_price is None or new_sl < self.sl_price:
                        self.sl_price = new_sl
            take_profit = exit_cfg.get("take_profit", {}).get("type")
            if take_profit == "opposite_bb":
                if self.position.is_long:
                    self.tp_price = self._bb_series.upper[-1]
                elif not self.position.is_long:
                    self.tp_price = self._bb_series.lower[-1]