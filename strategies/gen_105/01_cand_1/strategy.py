import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import atr, session_mask
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "GER40"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {})
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._atr_series = self.I(atr, self.data, self.spec["entry_rule"]["params"]["atr_period"])

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour")
        end_hour = rf.get("params", {}).get("end_hour")
        current_hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= current_hour < end_hour

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
        entry_rule = self.spec.get("entry_rule")
        if entry_rule:
            atr_now = float(self._atr_series[-1])
            if not np.isnan(atr_now):
                atr_multiplier = entry_rule.get("params", {}).get("atr_multiplier")
                price = float(self.data.Close[-1])
                if self.position.is_long:
                    self.sl_price = price - atr_multiplier * atr_now
                    self.tp_price = price + self.spec["exit_rule"]["params"]["tp_pips"] * self.data.pip
                else:
                    self.sl_price = price + atr_multiplier * atr_now
                    self.tp_price = price - self.spec["exit_rule"]["params"]["tp_pips"] * self.data.pip
                size = self.spec["sizing_rule"]["params"]["size"]
                self.position.size = size

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule")
        if exit_cfg:
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