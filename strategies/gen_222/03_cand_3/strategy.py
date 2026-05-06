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
        self._bb = self.I(bollinger, self.data, n=self.spec["entry_rule"]["params"]["bb_period"], dev=self.spec["entry_rule"]["params"]["bb_dev"])
        self._rsi = self.I(rsi, self.data, n=self.spec["entry_rule"]["params"]["rsi_period"])
        self._atr = self.I(atr, self.data, n=self.spec["sl_rule"]["params"]["atr_period"])
        self._middle_bb = self.I(sma, self.data, n=self.spec["entry_rule"]["params"]["bb_period"])

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_percentile = self.I(bb_width, self.data, n=self.spec["regime_filter"]["params"]["lookback"])
        bb_width_percentile_val = float(bb_width_percentile[-1])
        if bb_width_percentile_val < np.percentile(bb_width_percentile, self.spec["regime_filter"]["params"]["percentile"]):
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
            upper_bb = float(self._bb['upper'][-1])
            lower_bb = float(self._bb['lower'][-1])
            rsi = float(self._rsi[-1])
            if (close > upper_bb and rsi < self.spec["entry_rule"]["params"]["rsi_thresholds"][0]) or (close < lower_bb and rsi > self.spec["entry_rule"]["params"]["rsi_thresholds"][1]):
                lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data)
                self.position.enter(lots)
                atr = float(self._atr[-1])
                self.sl_price = close - self.spec["sl_rule"]["params"]["atr_multiplier"] * atr if close > upper_bb else close + self.spec["sl_rule"]["params"]["atr_multiplier"] * atr
                self.tp_price = close + self.spec["tp_rule"]["params"]["ratio"] * (close - self.sl_price) if close > upper_bb else close - self.spec["tp_rule"]["params"]["ratio"] * (self.sl_price - close)

    def _manage_open(self):
        time_stop = self.spec.get("exit_rule", {}).get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        middle_bb = float(self._middle_bb[-1])
        if self.position.is_long and float(self.data.Close[-1]) < middle_bb:
            self.position.close()
        elif not self.position.is_long and float(self.data.Close[-1]) > middle_bb:
            self.position.close()