import numpy as np
import pandas as pd
from agents import signals, risk, regime
from agents.backtester import RegimeStrategy

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("session_mask")
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(signals.session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.I(signals.bollinger, self.data, n=20, std_dev=2.0)
        self.I(signals.atr, self.data, n=14)

    def _regime_ok(self):
        return self._session_mask_full[-1] if self._session_mask_full is not None else True

    def _filters_ok(self):
        return self._session_mask_full[-1] if self._session_mask_full is not None else True

    def _enter_if_signal(self):
        long_signal = self.data.Close[-1] > self.I(signals.bollinger, self.data, n=20, std_dev=2.0).upper[-1]
        short_signal = self.data.Close[-1] < self.I(signals.bollinger, self.data, n=20, std_dev=2.0).lower[-1]
        if long_signal and self._session_mask_full[-1]:
            sl_points = 1.5 * self.I(signals.atr, self.data, n=14)[-1] / 0.1
            tp_points = 2 * self.I(signals.atr, self.data, n=14)[-1] / 0.1
            lots = float(risk.lots_by_risk_pct(float(self.equity), sl_points, 2.0, self._symbol))
            self.sl_price = self.data.Close[-1] - sl_points * 0.1
            self.tp_price = self.data.Close[-1] + tp_points * 0.1
            self.buy(size=lots, sl=self.sl_price, tp=self.tp_price)
        elif short_signal and self._session_mask_full[-1]:
            sl_points = 1.5 * self.I(signals.atr, self.data, n=14)[-1] / 0.1
            tp_points = 2 * self.I(signals.atr, self.data, n=14)[-1] / 0.1
            lots = float(risk.lots_by_risk_pct(float(self.equity), sl_points, 2.0, self._symbol))
            self.sl_price = self.data.Close[-1] + sl_points * 0.1
            self.tp_price = self.data.Close[-1] - tp_points * 0.1
            self.sell(size=lots, sl=self.sl_price, tp=self.tp_price)