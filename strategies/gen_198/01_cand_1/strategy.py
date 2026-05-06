import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
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
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._donchian_series = self.I(signals.donchian, self.data, 14)
        self._session_mask_full = np.asarray(session_mask(self.data.index, ["Asia", "London"]), dtype=bool)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "atr_range":
            atr_now = float(self._atr_series[-1])
            min_range_atr = rf["params"]["min_range_atr"]
            max_range_atr = rf["params"]["max_range_atr"]
            range_atr = self._donchian_series[-1] / atr_now
            return min_range_atr <= range_atr <= max_range_atr
        return True

    def _filters_ok(self) -> bool:
        filters = self.spec.get("filters", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def _enter_if_signal(self) -> None:
        er = self.spec.get("entry_rule")
        if er["type"] == "breakout_retest":
            breakout_threshold = er["params"]["breakout_threshold"]
            retest_threshold = er["params"]["retest_threshold"]
            donchian_high = self._donchian_series[-1][0]
            donchian_low = self._donchian_series[-1][1]
            close = self.data.Close[-1]
            if close > donchian_high * (1 + breakout_threshold / 100):
                self.sl_price = donchian_low * (1 - retest_threshold / 100)
                self.tp_price = close + (close - self.sl_price) * (er["params"]["tp_pips"] / 100)
                self.position.enter_long(lots_by_risk_pct(self.spec, self._equity_start, self.data))
            elif close < donchian_low * (1 - breakout_threshold / 100):
                self.sl_price = donchian_high * (1 + retest_threshold / 100)
                self.tp_price = close - (self.sl_price - close) * (er["params"]["tp_pips"] / 100)
                self.position.enter_short(lots_by_risk_pct(self.spec, self._equity_start, self.data))

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("params", {}).get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if exit_cfg["params"]["tp"] == "fixed_pips":
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()
        if exit_cfg["params"]["sl"] == "fixed_pips":
            if self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()