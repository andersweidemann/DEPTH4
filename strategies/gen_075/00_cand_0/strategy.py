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
        self.bollinger_bands = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.rsi = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self.atr = self.I(atr, self.data, self.spec["exit_rule"]["params"]["sl"]["params"]["atr_period"])

    def _regime_ok(self):
        bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        bb_width_now = float(self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"])[-1])
        bb_widths = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"])
        bb_widths = bb_widths[-len(self.data):]
        percentile = np.percentile(bb_widths, bb_width_percentile)
        return bb_width_now < percentile

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
            upper_bb = float(self.bollinger_bands[-1][2])
            lower_bb = float(self.bollinger_bands[-1][0])
            rsi_now = float(self.rsi[-1])
            if (close > upper_bb and rsi_now > self.spec["entry_rule"]["params"]["rsi_thresholds"][1]) or (close < lower_bb and rsi_now < self.spec["entry_rule"]["params"]["rsi_thresholds"][0]):
                self.sl_price = float(self.data.Close[-1]) - self.spec["exit_rule"]["params"]["sl"]["params"]["atr_multiplier"] * float(self.atr[-1]) if close > upper_bb else float(self.data.Close[-1]) + self.spec["exit_rule"]["params"]["sl"]["params"]["atr_multiplier"] * float(self.atr[-1])
                self.tp_price = float(self.data.Close[-1]) - 2 * self.spec["exit_rule"]["params"]["sl"]["params"]["atr_multiplier"] * float(self.atr[-1]) if close > upper_bb else float(self.data.Close[-1]) + 2 * self.spec["exit_rule"]["params"]["sl"]["params"]["atr_multiplier"] * float(self.atr[-1])
                self.position.enter(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data))

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
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
        atr_now = float(self.atr[-1])
        if atr_now > 0:
            price = float(self.data.Close[-1])
            for trade in self.trades:
                if trade.is_long and trade.pl_pct > 0:
                    new_sl = price - self.spec["exit_rule"]["params"]["sl"]["params"]["atr_multiplier"] * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
                elif not trade.is_long and trade.pl_pct > 0:
                    new_sl = price + self.spec["exit_rule"]["params"]["sl"]["params"]["atr_multiplier"] * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl