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
        self.bollinger = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.rsi = self.I(rsi, self.data, 7)
        self.atr = self.I(atr, self.data, self.spec["exit_rules"]["stop_loss"]["params"]["atr_period"])
        self.bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"])

    def _regime_ok(self) -> bool:
        bb_width_val = float(self.bb_width[-1])
        percentile = self.spec["regime_filter"]["params"]["percentile"]
        return bb_width_val < np.percentile(self.bb_width, percentile)

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        close = float(self.data.Close[-1])
        lower_bb = float(self.bollinger.lower[-1])
        upper_bb = float(self.bollinger.upper[-1])
        rsi_val = float(self.rsi[-1])
        if close < lower_bb and rsi_val < 10:
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start))
            self.sl_price = float(self.data.Close[-1]) - self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"] * float(self.atr[-1])
            self.tp_price = float(self.bollinger.upper[-1])
        elif close > upper_bb and rsi_val > 90:
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start))
            self.sl_price = float(self.data.Close[-1]) + self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"] * float(self.atr[-1])
            self.tp_price = float(self.bollinger.lower[-1])

    def _manage_open(self) -> None:
        if not self.position:
            return
        if self.position.is_long and float(self.data.Close[-1]) > self.tp_price:
            self.position.close()
        elif not self.position.is_long and float(self.data.Close[-1]) < self.tp_price:
            self.position.close()
        if self.spec["exit_rules"]["time_stop"]["params"]["bars"] is not None:
            if len(self.position) >= self.spec["exit_rules"]["time_stop"]["params"]["bars"]:
                self.position.close()