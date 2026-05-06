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
        self.bollinger = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self.rsi = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self.atr = self.I(atr, self.data, self.spec["exit_rule"]["params"]["stop_loss"]["params"]["period"])
        self.bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["period"], self.spec["regime_filter"]["params"]["deviation"])
        self._session_mask_full = None

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_val = float(self.bb_width[-1])
        bb_width_percentile = np.percentile(self.bb_width, self.spec["regime_filter"]["params"]["percentile"])
        return bb_width_val < bb_width_percentile

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
            upper = float(self.bollinger.upper[-1])
            lower = float(self.bollinger.lower[-1])
            rsi_val = float(self.rsi[-1])
            if (close > upper and rsi_val > self.spec["entry_rule"]["params"]["rsi_thresholds"][1]) or (close < lower and rsi_val < self.spec["entry_rule"]["params"]["rsi_thresholds"][0]):
                lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data)
                self.position.enter(lots)
                self.sl_price = float(self.data.Close[-1]) - self.spec["exit_rule"]["params"]["stop_loss"]["params"]["multiplier"] * float(self.atr[-1])
                self.tp_price = float(self.data.Close[-1]) + (float(self.data.Close[-1]) - self.sl_price)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        take_profit_cfg = exit_cfg.get("take_profit", {})
        if take_profit_cfg:
            if take_profit_cfg["type"] == "opposite_bb":
                upper = float(self.bollinger.upper[-1])
                lower = float(self.bollinger.lower[-1])
                if self.position.is_long and float(self.data.Close[-1]) >= upper:
                    self.position.close()
                elif not self.position.is_long and float(self.data.Close[-1]) <= lower:
                    self.position.close()
        stop_loss_cfg = exit_cfg.get("stop_loss", {})
        if stop_loss_cfg:
            if stop_loss_cfg["type"] == "atr":
                atr_val = float(self.atr[-1])
                if self.position.is_long and float(self.data.Close[-1]) <= self.sl_price:
                    self.position.close()
                elif not self.position.is_long and float(self.data.Close[-1]) >= self.sl_price:
                    self.position.close()