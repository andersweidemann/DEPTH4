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
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._bb_width_series = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["lookback"])
        self._rsi_series = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self._bollinger_series = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])

    def _regime_ok(self):
        bb_width_percentile = np.percentile(self._bb_width_series, self.spec["regime_filter"]["params"]["percentile"])
        return self._bb_width_series[-1] > bb_width_percentile

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            rsi = self._rsi_series[-1]
            if (rsi < self.spec["entry_rule"]["params"]["rsi_thresholds"][0] or 
                rsi > self.spec["entry_rule"]["params"]["rsi_thresholds"][1]):
                close = self.data.Close[-1]
                lower_bb = self._bollinger_series[-1][0]
                upper_bb = self._bollinger_series[-1][1]
                if close < lower_bb or close > upper_bb:
                    self.sl_price = self.data.Close[-1] - self.I(atr, self.data, self.spec["exit_rule"]["params"]["stop_loss"]["atr_period"])[-1] * self.spec["exit_rule"]["params"]["stop_loss"]["atr_multiplier"]
                    self.tp_price = self.data.Close[-1] + (self.data.Close[-1] - lower_bb) if close < lower_bb else self.data.Close[-1] - (upper_bb - self.data.Close[-1])
                    self.position.enter(long=(close < lower_bb), size=lots_by_risk_pct(self.spec["sizing_rule"]["params"]["size"], self._equity_start, self.data))

    def _manage_open(self):
        if self.position:
            if self.data.index[-1] - self.position.entry_time > pd.Timedelta(minutes=self.spec["exit_rule"]["params"]["time_stop"]["bars"] * 5):
                self.position.close()
            elif self.tp_price and ((self.position.is_long and self.data.Close[-1] >= self.tp_price) or (not self.position.is_long and self.data.Close[-1] <= self.tp_price)):
                self.position.close()
            elif self.sl_price and ((self.position.is_long and self.data.Close[-1] <= self.sl_price) or (not self.position.is_long and self.data.Close[-1] >= self.sl_price)):
                self.position.close()