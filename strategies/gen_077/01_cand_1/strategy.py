import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import atr, donchian, session_mask
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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session_mask")
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.range_high = self.I(donchian, self.data, 20, 'high')
        self.range_low = self.I(donchian, self.data, 20, 'low')
        self.atr = self.I(atr, self.data, 20)

    def _regime_ok(self):
        return True

    def _filters_ok(self):
        filters = self.spec.get("regime_filter", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self):
        range_atr_min = self.spec.get("entry_rule", {}).get("params", {}).get("range_atr_min", 0.5)
        range_atr_max = self.spec.get("entry_rule", {}).get("params", {}).get("range_atr_max", 2.0)
        breakout_atr_multiplier = self.spec.get("entry_rule", {}).get("params", {}).get("breakout_atr_multiplier", 1.2)
        range_size = self.range_high[-1] - self.range_low[-1]
        range_atr = range_size / self.atr[-1]
        if range_atr_min <= range_atr <= range_atr_max:
            if self.data.Close[-1] > self.range_high[-1] + breakout_atr_multiplier * self.atr[-1]:
                self.position.enter_long(lots_by_risk_pct(self.spec.get("sizing_rule", {}).get("params", {}).get("size", 0.1), self.equity, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] - self.spec.get("exit_rule", {}).get("params", {}).get("sl_pips", 100) * self.data._pip
                self.tp_price = self.data.Close[-1] + self.spec.get("exit_rule", {}).get("params", {}).get("tp_pips", 500) * self.data._pip
            elif self.data.Close[-1] < self.range_low[-1] - breakout_atr_multiplier * self.atr[-1]:
                self.position.enter_short(lots_by_risk_pct(self.spec.get("sizing_rule", {}).get("params", {}).get("size", 0.1), self.equity, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] + self.spec.get("exit_rule", {}).get("params", {}).get("sl_pips", 100) * self.data._pip
                self.tp_price = self.data.Close[-1] - self.spec.get("exit_rule", {}).get("params", {}).get("tp_pips", 500) * self.data._pip

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
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