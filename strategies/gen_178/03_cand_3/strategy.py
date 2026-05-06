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
        self._bb_period = self.spec["regime_filter"]["params"]["bb_period"]
        self._bb_deviation = self.spec["regime_filter"]["params"]["bb_deviation"]
        self._rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self._rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self._take_profit = self.spec["exit_rule"]["params"]["take_profit"]
        self._stop_loss = self.spec["exit_rule"]["params"]["stop_loss"]
        self._time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        self._fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self._bb_series = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._rsi_series = self.I(rsi, self.data, self._rsi_period)
        self._atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self):
        bb_touch = self.spec["regime_filter"]["type"] == "bb_touch"
        if bb_touch:
            bb_val = float(self._bb_series[-1])
            if np.isnan(bb_val):
                return False
            return True
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self):
        bb_touch_and_bounce = self.spec["entry_rule"]["type"] == "bb_touch_and_bounce"
        if bb_touch_and_bounce:
            rsi_val = float(self._rsi_series[-1])
            if rsi_val < self._rsi_thresholds[0] or rsi_val > self._rsi_thresholds[1]:
                if self.position:
                    self.position.close()
                else:
                    lots = lots_by_risk_pct(self._fraction, self.equity, self.data)
                    if lots > 0:
                        self.buy(lots)
                        self.sl_price = self.data.Close[-1] - 1.2 * float(self._atr_series[-1])
                        if self._take_profit == "opposite_bollinger_band":
                            self.tp_price = self._bb_series[-1][1] if self.position.is_long else self._bb_series[-1][0]

    def _manage_open(self):
        time_stop = self._time_stop
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if self._stop_loss == "1.2x_atr":
            atr_now = float(self._atr_series[-1])
            if not np.isnan(atr_now):
                price = float(self.data.Close[-1])
                if self.position.is_long:
                    new_sl = price - 1.2 * atr_now
                    if self.position.sl is None or new_sl > self.position.sl:
                        self.position.sl = new_sl
                else:
                    new_sl = price + 1.2 * atr_now
                    if self.position.sl is None or new_sl < self.position.sl:
                        self.position.sl = new_sl