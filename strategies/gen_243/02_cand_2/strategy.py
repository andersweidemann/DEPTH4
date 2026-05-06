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
        self._adx_series = self.I(adx, self.data, self.spec["regime_filter"]["params"]["threshold"])
        self._ma_series = self.I(sma, self.data.Close, self.spec["entry_rule"]["params"]["ma_period"])
        self._rsi_series = self.I(rsi, self.data.Close, self.spec["entry_rule"]["params"]["rsi_period"])
        self._atr_series = self.I(atr, self.data, self.spec["exit_rule"]["params"]["tp"]["params"]["atr_period"])
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0

    def _regime_ok(self):
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val):
            return False
        mn = self.spec["regime_filter"]["params"]["threshold"]
        if adx_val < mn:
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0)):
            return False
        return True

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            close = float(self.data.Close[-1])
            ma = float(self._ma_series[-1])
            rsi = float(self._rsi_series[-1])
            if close > ma and rsi < self.spec["entry_rule"]["params"]["rsi_thresholds"][1]:
                self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data))
                self.sl_price = close - self.spec["exit_rule"]["params"]["sl"]["params"]["pips"] * self.data.Pip
                self.tp_price = close + self.spec["exit_rule"]["params"]["tp"]["params"]["pips"] * self.data.Pip
            elif close < ma and rsi > self.spec["entry_rule"]["params"]["rsi_thresholds"][0]:
                self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data))
                self.sl_price = close + self.spec["exit_rule"]["params"]["sl"]["params"]["pips"] * self.data.Pip
                self.tp_price = close - self.spec["exit_rule"]["params"]["tp"]["params"]["pips"] * self.data.Pip

    def _manage_open(self):
        exit_cfg = self.spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        trail_mult = exit_cfg.get("trail_atr_mult")
        if trail_mult and hasattr(self, "_atr_series") and self.trades:
            atr_now = float(self._atr_series[-1])
            if not np.isnan(atr_now):
                price = float(self.data.Close[-1])
                for trade in self.trades:
                    if trade.is_long and trade.pl_pct > 0:
                        new_sl = price - trail_mult * atr_now
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                    elif not trade.is_long and trade.pl_pct > 0:
                        new_sl = price + trail_mult * atr_now
                        if trade.sl is None or new_sl < trade.sl:
                            trade.sl = new_sl