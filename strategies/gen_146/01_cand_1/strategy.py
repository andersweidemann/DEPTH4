import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "GER40"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.asia_range_high = None
        self.asia_range_low = None
        self.upper_bb = None
        self.lower_bb = None
        self.I(signals.bollinger, self.data, n=20)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour")
        end_hour = rf.get("params", {}).get("end_hour")
        current_hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= current_hour < end_hour

    def _filters_ok(self) -> bool:
        return self._regime_ok()

    def _enter_if_signal(self) -> None:
        entry_rules = self.spec.get("entry_rules")
        long_condition = entry_rules.get("long", {}).get("condition")
        short_condition = entry_rules.get("short", {}).get("condition")
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])
        close = float(self.data.Close[-1])
        self.upper_bb = float(self.I(signals.bollinger, self.data, n=20)[-1][1])
        self.lower_bb = float(self.I(signals.bollinger, self.data, n=20)[-1][2])
        self.asia_range_high = float(self.I(signals.donchian, self.data, n=20)[-1][1])
        self.asia_range_low = float(self.I(signals.donchian, self.data, n=20)[-1][0])
        if long_condition and eval(long_condition):
            self.position.enter_long()
            self.sl_price = close - 100 * self._symbol.pip
            self.tp_price = close + 500 * self._symbol.pip
        elif short_condition and eval(short_condition):
            self.position.enter_short()
            self.sl_price = close + 100 * self._symbol.pip
            self.tp_price = close - 500 * self._symbol.pip

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return