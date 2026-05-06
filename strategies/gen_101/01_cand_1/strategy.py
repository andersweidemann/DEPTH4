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
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.atr = self.I(atr, self.data, self.spec["regime_filter"]["params"]["atr_period"])
        self.asia_range_high = self.I(donchian, self.data, 60, "high")
        self.asia_range_low = self.I(donchian, self.data, 60, "low")
        self.london_breakout_high = self.I(donchian, self.data, 30, "high")
        self.london_breakout_low = self.I(donchian, self.data, 30, "low")

    def _regime_ok(self):
        min_atr_multiple = self.spec["regime_filter"]["params"]["min_atr_multiple"]
        max_atr_multiple = self.spec["regime_filter"]["params"]["max_atr_multiple"]
        atr_now = float(self.atr[-1])
        asia_range = self.asia_range_high[-1] - self.asia_range_low[-1]
        if atr_now * min_atr_multiple <= asia_range <= atr_now * max_atr_multiple:
            return True
        return False

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            breakout_threshold = self.spec["entry_rule"]["params"]["breakout_threshold"]
            retest_threshold = self.spec["entry_rule"]["params"]["retest_threshold"]
            if self.london_breakout_high[-1] > self.asia_range_high[-1] * breakout_threshold:
                self.position.enter_long(size=lots_by_risk_pct(self._equity_start, 0.01))
                self.sl_price = self.london_breakout_low[-1] - retest_threshold * (self.london_breakout_high[-1] - self.london_breakout_low[-1])
                self.tp_price = self.london_breakout_high[-1] + (self.london_breakout_high[-1] - self.london_breakout_low[-1]) * self.spec["exit_rule"]["params"]["tp_pips"] / 10000
            elif self.london_breakout_low[-1] < self.asia_range_low[-1] / breakout_threshold:
                self.position.enter_short(size=lots_by_risk_pct(self._equity_start, 0.01))
                self.sl_price = self.london_breakout_high[-1] + retest_threshold * (self.london_breakout_high[-1] - self.london_breakout_low[-1])
                self.tp_price = self.london_breakout_low[-1] - (self.london_breakout_high[-1] - self.london_breakout_low[-1]) * self.spec["exit_rule"]["params"]["tp_pips"] / 10000

    def _manage_open(self):
        super()._manage_open()
        if self.position:
            sl_pips = self.spec["exit_rule"]["params"]["sl_pips"]
            if self.position.is_long:
                self.sl_price = max(self.sl_price, self.data.Low[-1] - sl_pips / 10000)
            else:
                self.sl_price = min(self.sl_price, self.data.High[-1] + sl_pips / 10000)