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
        self.atr_period = self.spec["exit_rule"]["params"]["stop_loss"]["params"]["atr_period"]
        self.atr_multiplier = self.spec["exit_rule"]["params"]["stop_loss"]["params"]["atr_multiplier"]
        self.take_profit_type = self.spec["exit_rule"]["params"]["take_profit"]["type"]
        self.time_stop_bars = self.spec["exit_rule"]["params"]["time_stop"]["params"]["bars"]
        self.fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self.I("bb_width", self.data, self.bb_period)
        self.I("rsi", self.data, self.rsi_period)
        self.I("atr", self.data, self.atr_period)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        ind = rf.get("indicator", "bb_width_percentile")
        if ind == "bb_width_percentile":
            bb_width_val = float(self.I("bb_width", self.data, self.bb_period)[-1])
            percentile = rf.get("params", {}).get("percentile")
            lookback = rf.get("params", {}).get("lookback")
            if bb_width_val < np.percentile(self.I("bb_width", self.data, self.bb_period)[-lookback:], percentile):
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
            bb = self.I("bollinger", self.data, self.bb_period, self.bb_deviation)
            rsi = self.I("rsi", self.data, self.rsi_period)
            if (self.data.Close[-1] < bb["lower"][-1] and rsi[-1] < self.rsi_thresholds[0]) or (self.data.Close[-1] > bb["upper"][-1] and rsi[-1] > self.rsi_thresholds[1]):
                self.sl_price = self.data.Close[-1] - self.I("atr", self.data, self.atr_period)[-1] * self.atr_multiplier if self.data.Close[-1] > bb["upper"][-1] else self.data.Close[-1] + self.I("atr", self.data, self.atr_period)[-1] * self.atr_multiplier
                self.tp_price = bb["upper"][-1] if self.data.Close[-1] < bb["lower"][-1] else bb["lower"][-1]
                lots = lots_by_risk_pct(self.spec, self.data, self.equity, self.fraction)
                self.position.enter(lots)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop", {}).get("bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        atr_now = float(self.I("atr", self.data, self.atr_period)[-1])
        if atr_now > 0:
            price = float(self.data.Close[-1])
            for trade in self.trades:
                if trade.is_long and trade.pl_pct > 0:
                    new_sl = price - atr_now * self.atr_multiplier
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
                elif not trade.is_long and trade.pl_pct > 0:
                    new_sl = price + atr_now * self.atr_multiplier
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl
        if self.take_profit_type == "opposite_bb":
            bb = self.I("bollinger", self.data, self.bb_period, self.bb_deviation)
            for trade in self.trades:
                if trade.is_long and trade.entry_price < bb["lower"][-1]:
                    trade.tp = bb["upper"][-1]
                elif not trade.is_long and trade.entry_price > bb["upper"][-1]:
                    trade.tp = bb["lower"][-1]