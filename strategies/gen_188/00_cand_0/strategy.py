import numpy as np
import pandas as pd
from agents import signals, risk, regime
from agents.backtester import RegimeStrategy

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(signals.session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._bb_series = self.I(signals.bollinger, self.data, n=self.spec["entry_rule"]["params"]["bb_period"], deviation=self.spec["entry_rule"]["params"]["bb_deviation"])
        self._rsi_series = self.I(signals.rsi, self.data, n=self.spec["entry_rule"]["params"]["rsi_period"])
        self._atr_series = self.I(signals.atr, self.data, n=14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width = self.I(signals.bb_width, self.data, n=self.spec["regime_filter"]["params"]["period"], deviation=self.spec["regime_filter"]["params"]["deviation"])
        bb_width_percentile = np.percentile(bb_width, self.spec["regime_filter"]["params"]["percentile"])
        return bb_width[-1] > bb_width_percentile

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
            if not risk.spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", None)):
            return False
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        if not self._regime_ok() or not self._filters_ok():
            return
        bb = self._bb_series
        rsi = self._rsi_series
        if rsi[-1] < self.spec["entry_rule"]["params"]["rsi_thresholds"][0] and self.data.Close[-1] < bb["lower"][-1]:
            self.position.enter_long(lots=risk.lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["sl"] * self._atr_series[-1]
            self.tp_price = bb["upper"][-1]
        elif rsi[-1] > self.spec["entry_rule"]["params"]["rsi_thresholds"][1] and self.data.Close[-1] > bb["upper"][-1]:
            self.position.enter_short(lots=risk.lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["sl"] * self._atr_series[-1]
            self.tp_price = bb["lower"][-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        atr_now = float(self._atr_series[-1])
        price = float(self.data.Close[-1])
        if self.position.is_long:
            new_sl = price - self.spec["exit_rule"]["params"]["sl"] * atr_now
            if self.sl_price is None or new_sl > self.sl_price:
                self.sl_price = new_sl
        elif not self.position.is_long:
            new_sl = price + self.spec["exit_rule"]["params"]["sl"] * atr_now
            if self.sl_price is None or new_sl < self.sl_price:
                self.sl_price = new_sl