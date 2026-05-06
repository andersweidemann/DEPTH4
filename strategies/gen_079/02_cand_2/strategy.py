import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "US500"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self._rsi_series = self.I(rsi, self.data, 7)
        self._bb_series = self.I(bollinger, self.data, 20)
        self._atr_series = self.I(atr, self.data, 14)
        self._lower_bb = self._bb_series[:, 0]
        self._upper_bb = self._bb_series[:, 2]

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "rsi":
            rsi_val = float(self._rsi_series[-1])
            if rsi_val > rf.get("params", {}).get("threshold", 70):
                return False
        return True

    def _filters_ok(self) -> bool:
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

    def _enter_if_signal(self) -> None:
        er = self.spec.get("entry_rules")
        if er:
            long_condition = er.get("long", {}).get("condition")
            short_condition = er.get("short", {}).get("condition")
            if long_condition and short_condition:
                if long_condition == "rsi(7) < 30 && close > lower_bb":
                    if float(self._rsi_series[-1]) < 30 and float(self.data.Close[-1]) > float(self._lower_bb[-1]):
                        self.position.open(long=True, size=lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("size", 0.1), self.equity, self.data))
                        self.sl_price = float(self.data.Close[-1]) - float(self.I(atr, self.data, 14)[-1]) * self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("multiplier", 1.5)
                        self.tp_price = float(self.data.Close[-1]) + (float(self._upper_bb[-1]) - float(self.data.Close[-1]))
                elif short_condition == "rsi(7) > 70 && close < upper_bb":
                    if float(self._rsi_series[-1]) > 70 and float(self.data.Close[-1]) < float(self._upper_bb[-1]):
                        self.position.open(long=False, size=lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("size", 0.1), self.equity, self.data))
                        self.sl_price = float(self.data.Close[-1]) + float(self.I(atr, self.data, 14)[-1]) * self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("multiplier", 1.5)
                        self.tp_price = float(self.data.Close[-1]) - (float(self.data.Close[-1]) - float(self._lower_bb[-1]))

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("count", 30)
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return