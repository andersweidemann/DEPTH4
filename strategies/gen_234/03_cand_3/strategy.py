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
        self.lower_bb = self.I(bollinger, self.data, n=20, dev=2.0, type="lower")
        self.upper_bb = self.I(bollinger, self.data, n=20, dev=2.0, type="upper")
        self.rsi = self.I(rsi, self.data, n=7)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "bb_touch":
            return True
        return super()._regime_ok()

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        entry_cfg = self.spec.get("entry_rules")
        if entry_cfg:
            long_condition = entry_cfg.get("long", {}).get("condition")
            short_condition = entry_cfg.get("short", {}).get("condition")
            if long_condition and eval(long_condition):
                self.position.enter_long()
                self.sl_price = self.data.Close[-1] - 50 * self.data._pip
                self.tp_price = self.data.Close[-1] + 100 * self.data._pip
            elif short_condition and eval(short_condition):
                self.position.enter_short()
                self.sl_price = self.data.Close[-1] + 50 * self.data._pip
                self.tp_price = self.data.Close[-1] - 100 * self.data._pip

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        if exit_cfg:
            time_stop = exit_cfg.get("time_stop", {}).get("num_hours")
            if time_stop is not None:
                trade = self.trades[-1] if self.trades else None
                if trade is not None:
                    bars_open = len(self.data) - trade.entry_bar
                    if bars_open >= time_stop * 60 // self.data._tf:
                        self.position.close()
            sl = exit_cfg.get("sl", {}).get("pips")
            if sl is not None:
                if self.position.is_long:
                    self.sl_price = self.data.Close[-1] - sl * self.data._pip
                elif self.position.is_short:
                    self.sl_price = self.data.Close[-1] + sl * self.data._pip
            tp = exit_cfg.get("tp", {}).get("pips")
            if tp is not None:
                if self.position.is_long:
                    self.tp_price = self.data.Close[-1] + tp * self.data._pip
                elif self.position.is_short:
                    self.tp_price = self.data.Close[-1] - tp * self.data._pip
        super()._manage_open()