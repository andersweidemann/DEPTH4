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
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self.lower_bollinger_band = self.I(bollinger, self.data, 20, 2.0, 'lower')
        self.upper_bollinger_band = self.I(bollinger, self.data, 20, 2.0, 'upper')
        self.rsi = self.I(rsi, self.data, 7)
        self.atr = self.I(atr, self.data, 14)
        self.bb_width_percentile = self.I(bb_width, self.data, 20, 2.0)

    def _regime_ok(self):
        bb_width_percentile = float(self.bb_width_percentile[-1])
        return bb_width_percentile > 30

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        close = float(self.data.Close[-1])
        if close < float(self.lower_bollinger_band[-1]) and float(self.rsi[-1]) < 10:
            sl_points = 1.5 * float(self.atr[-1]) / 0.1
            lots = float(risk.lots_by_risk_pct(float(self.equity), sl_points, 2, self._symbol))
            self.sl_price = close - 1.5 * float(self.atr[-1])
            self.tp_price = float(self.upper_bollinger_band[-1])
            self.buy(size=lots, sl=self.sl_price, tp=self.tp_price)
        elif close > float(self.upper_bollinger_band[-1]) and float(self.rsi[-1]) > 90:
            sl_points = 1.5 * float(self.atr[-1]) / 0.1
            lots = float(risk.lots_by_risk_pct(float(self.equity), sl_points, 2, self._symbol))
            self.sl_price = close + 1.5 * float(self.atr[-1])
            self.tp_price = float(self.lower_bollinger_band[-1])
            self.sell(size=lots, sl=self.sl_price, tp=self.tp_price)