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
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.asia_range_start = self.spec["entry_rule"]["params"]["asia_range_start"]
        self.asia_range_end = self.spec["entry_rule"]["params"]["asia_range_end"]
        self.breakout_threshold = self.spec["entry_rule"]["params"]["breakout_threshold"]
        self.tp_pips = self.spec["exit_rule"]["params"]["tp_pips"]
        self.sl_pips = self.spec["exit_rule"]["params"]["sl_pips"]
        self.time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        self.fraction = self.spec["sizing_rule"]["params"]["fraction"]

        self.high = self.data.High
        self.low = self.data.Low
        self.close = self.data.Close

        self.london_session_start = self.spec["regime_filter"]["params"]["start_hour"]
        self.london_session_end = self.spec["regime_filter"]["params"]["end_hour"]

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "session":
            current_hour = pd.Timestamp(self.data.index[-1]).hour
            return self.london_session_start <= current_hour < self.london_session_end
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
        if self._regime_ok() and self._filters_ok():
            asia_range_high = self.high[self.asia_range_start:self.asia_range_end].max()
            asia_range_low = self.low[self.asia_range_start:self.asia_range_end].min()
            current_price = self.close[-1]
            if current_price > asia_range_high * (1 + self.breakout_threshold / 100):
                self.position.enter_long(lots_by_risk_pct(self.equity, self.fraction, self.sl_pips))
                self.sl_price = current_price - self.sl_pips * self.data._pip
                self.tp_price = current_price + self.tp_pips * self.data._pip
            elif current_price < asia_range_low * (1 - self.breakout_threshold / 100):
                self.position.enter_short(lots_by_risk_pct(self.equity, self.fraction, self.sl_pips))
                self.sl_price = current_price + self.sl_pips * self.data._pip
                self.tp_price = current_price - self.tp_pips * self.data._pip

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        trade = self.trades[-1]
        if trade is not None:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return