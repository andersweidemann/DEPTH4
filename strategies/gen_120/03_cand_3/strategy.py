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
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._atr_series = self.I(signals.atr, self.data, self.spec["regime_filter"]["params"]["atr_period"])
        self._bb_series = self.I(signals.bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self._rsi_series = self.I(signals.rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self._session_mask_full = None

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        atr_val = float(self._atr_series[-1])
        atr_threshold = rf["params"]["atr_threshold"]
        if atr_val > atr_threshold:
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
            if not spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self) -> None:
        er = self.spec["entry_rule"]
        bb_period = er["params"]["bb_period"]
        bb_deviation = er["params"]["bb_deviation"]
        rsi_period = er["params"]["rsi_period"]
        rsi_thresholds = er["params"]["rsi_thresholds"]
        bb_series = self._bb_series
        rsi_series = self._rsi_series
        close_price = self.data.Close[-1]
        if close_price > bb_series[-1][1] and rsi_series[-1] > rsi_thresholds[1]:
            self.position.enter(long=False, size=lots_by_risk_pct(self.spec["sizing_rule"]["params"]["size"], self.equity, self.data.Close[-1]))
            self.sl_price = close_price - self.spec["exit_rule"]["params"]["sl"] * self._atr_series[-1]
            self.tp_price = bb_series[-1][0]
        elif close_price < bb_series[-1][0] and rsi_series[-1] < rsi_thresholds[0]:
            self.position.enter(long=True, size=lots_by_risk_pct(self.spec["sizing_rule"]["params"]["size"], self.equity, self.data.Close[-1]))
            self.sl_price = close_price + self.spec["exit_rule"]["params"]["sl"] * self._atr_series[-1]
            self.tp_price = bb_series[-1][1]

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop", 30)
        if not self.position:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= time_stop:
            self.position.close()
            return
        if exit_cfg.get("tp") == "opposite_bb":
            bb_series = self._bb_series
            if self.position.is_long and self.data.Close[-1] >= bb_series[-1][1]:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= bb_series[-1][0]:
                self.position.close()