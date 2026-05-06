import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "XAUUSD"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self.lower_bb = self.I(bollinger, self.data, 20, 2.0, 'lower')
        self.upper_bb = self.I(bollinger, self.data, 20, 2.0, 'upper')
        self.bb_width = self.I(bb_width, self.data, 20)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "bb_width":
            period = rf.get("params", {}).get("period", 20)
            min_width = rf.get("params", {}).get("min_width", 0.5)
            if self.bb_width[-1] < min_width:
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
            if not risk.spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"])):
            return False
        return True

    def _enter_if_signal(self):
        entry_cfg = self.spec.get("entry_rules")
        if entry_cfg:
            long_condition = entry_cfg.get("long", {}).get("condition")
            short_condition = entry_cfg.get("short", {}).get("condition")
            if long_condition and eval(long_condition):
                self.position.open_long()
                self.sl_price = self.data.Close[-1] - 100 * self.data.Close[-1] / 1e5
                self.tp_price = self.data.Close[-1] + (self.upper_bb[-1] - self.data.Close[-1])
            elif short_condition and eval(short_condition):
                self.position.open_short()
                self.sl_price = self.data.Close[-1] + 100 * self.data.Close[-1] / 1e5
                self.tp_price = self.data.Close[-1] - (self.data.Close[-1] - self.lower_bb[-1])

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        if exit_cfg:
            time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("bars")
            if not self.position:
                return
            if time_stop is not None:
                trade = self.trades[-1]
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()