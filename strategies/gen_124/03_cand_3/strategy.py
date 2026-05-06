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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session")
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.bb_period = self.spec["entry_rule"]["params"]["bb_period"]
        self.bb_deviation = self.spec["entry_rule"]["params"]["bb_deviation"]
        self.rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self.rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self.atr_period = self.spec["exit_rule"]["params"]["stop_loss"]["params"]["atr_period"]
        self.atr_multiplier = self.spec["exit_rule"]["params"]["stop_loss"]["params"]["atr_multiplier"]
        self.take_profit_type = self.spec["exit_rule"]["params"]["take_profit"]["type"]
        self.time_stop_bars = self.spec["exit_rule"]["params"]["time_stop"]["params"]["bars"]
        self.fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self.I(signals.bollinger, self.data, self.bb_period, self.bb_deviation)
        self.I(rsi, self.data, self.rsi_period)
        self.I(atr, self.data, self.atr_period)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "session_mask":
            return self._session_mask_full[-1] if self._session_mask_full is not None else True
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
        if self._regime_ok() and self._filters_ok():
            bb = self.I(signals.bollinger, self.data, self.bb_period, self.bb_deviation)
            rsi = self.I(rsi, self.data, self.rsi_period)
            if rsi[-1] < self.rsi_thresholds[0] and self.data.Close[-1] < bb[-1]:
                self.sl_price = self.data.Close[-1] - self.atr_multiplier * self.I(atr, self.data, self.atr_period)[-1]
                self.tp_price = self.data.Close[-1] + (self.data.Close[-1] - self.sl_price)
                self.position.enter(long=True, size=lots_by_risk_pct(self.equity, self.fraction, self.data))
            elif rsi[-1] > self.rsi_thresholds[1] and self.data.Close[-1] > bb[-1]:
                self.sl_price = self.data.Close[-1] + self.atr_multiplier * self.I(atr, self.data, self.atr_period)[-1]
                self.tp_price = self.data.Close[-1] - (self.sl_price - self.data.Close[-1])
                self.position.enter(long=False, size=lots_by_risk_pct(self.equity, self.fraction, self.data))

    def _manage_open(self):
        if self.position:
            if self.take_profit_type == "opposite_bb":
                bb = self.I(signals.bollinger, self.data, self.bb_period, self.bb_deviation)
                if self.position.is_long and self.data.Close[-1] > bb[-1]:
                    self.position.close()
                elif not self.position.is_long and self.data.Close[-1] < bb[-1]:
                    self.position.close()
            if self.time_stop_bars is not None:
                trade = self.trades[-1]
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= self.time_stop_bars:
                    self.position.close()