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
        sessions = self.spec.get("regime_filter", {}).get("params", {})
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, [sessions]), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._atr_series = self.I(atr, self.data, 14)
        self._asia_high = self.I(donchian, self.data, 14, "high")
        self._asia_low = self.I(donchian, self.data, 14, "low")
        self._displacement_candle = np.abs(self.data.Close - self.data.Open)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour", 7)
        end_hour = rf.get("params", {}).get("end_hour", 10)
        current_hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= current_hour <= end_hour

    def _filters_ok(self):
        return self._regime_ok()

    def _enter_if_signal(self):
        long_condition = self._displacement_candle[-1] > 1.2 * self._atr_series[-1] and self.data.Close[-1] > self._asia_high[-1]
        short_condition = self._displacement_candle[-1] < -1.2 * self._atr_series[-1] and self.data.Close[-1] < self._asia_low[-1]
        if long_condition and not self.position:
            self.position.enter_long(lots_by_risk_pct(self.spec, self._equity_start, self.data))
            self.sl_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("stop_loss", {}).get("params", {}).get("pips", 100) * self.data.Pip
            self.tp_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("take_profit", {}).get("params", {}).get("pips", 500) * self.data.Pip
        elif short_condition and not self.position:
            self.position.enter_short(lots_by_risk_pct(self.spec, self._equity_start, self.data))
            self.sl_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("stop_loss", {}).get("params", {}).get("pips", 100) * self.data.Pip
            self.tp_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("take_profit", {}).get("params", {}).get("pips", 500) * self.data.Pip

    def _manage_open(self):
        time_stop = self.spec.get("exit_rules", {}).get("time_stop", {}).get("params", {}).get("num_bars", 20)
        if self.position and time_stop:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()