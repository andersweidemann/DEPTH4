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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session_hours", [])
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._bb_series = self.I(bollinger, self.data, n=self.spec["entry_rule"]["params"]["bb_period"], dev=self.spec["entry_rule"]["params"]["bb_deviation"])
        self._atr_series = self.I(atr, self.data, n=14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "session_filter":
            return self._session_mask_full[-1] if self._session_mask_full is not None else True
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
        bb = self._bb_series[-1]
        close = self.data.Close[-1]
        if close <= bb["lower"] and self.data.Close[-2] > bb["lower"]:
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._atr_series[-1]))
            self.sl_price = close - self.spec["exit_rule"]["params"]["sl"] * self._atr_series[-1]
            self.tp_price = bb["upper"]
        elif close >= bb["upper"] and self.data.Close[-2] < bb["upper"]:
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._atr_series[-1]))
            self.sl_price = close + self.spec["exit_rule"]["params"]["sl"] * self._atr_series[-1]
            self.tp_price = bb["lower"]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop", 30)
        if not self.position:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= time_stop:
            self.position.close()
            return
        atr_now = float(self._atr_series[-1])
        price = float(self.data.Close[-1])
        if trade.is_long and trade.pl_pct > 0:
            new_sl = price - exit_cfg.get("sl", 1.5) * atr_now
            if trade.sl is None or new_sl > trade.sl:
                trade.sl = new_sl
        elif not trade.is_long and trade.pl_pct > 0:
            new_sl = price + exit_cfg.get("sl", 1.5) * atr_now
            if trade.sl is None or new_sl < trade.sl:
                trade.sl = new_sl