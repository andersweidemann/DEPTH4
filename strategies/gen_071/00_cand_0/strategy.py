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
        sessions = self.spec.get("filters", {}).get("session_utc") or []
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
        self.bollinger = self.I(bollinger, self.data.Close, self.bb_period, self.bb_deviation)
        self.rsi = self.I(rsi, self.data.Close, self.rsi_period)
        self.bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        self.bb_width_lookback = self.spec["regime_filter"]["params"]["lookback"]
        self.bb_width = self.I(bb_width, self.data.Close, self.bb_period)
        self.atr_period = self.spec["exit_rule"]["params"]["stop_loss"]["params"]["atr_period"]
        self.atr_multiplier = self.spec["exit_rule"]["params"]["stop_loss"]["params"]["atr_multiplier"]
        self.atr = self.I(atr, self.data.High, self.data.Low, self.data.Close, self.atr_period)

    def _regime_ok(self):
        bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        bb_width_lookback = self.spec["regime_filter"]["params"]["lookback"]
        bb_width_series = self.I(bb_width, self.data.Close, self.bb_period)
        bb_width_percentile_value = np.percentile(bb_width_series[-bb_width_lookback:], bb_width_percentile)
        return self.bb_width[-1] > bb_width_percentile_value

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
        if self.position:
            return
        if not self._regime_ok() or not self._filters_ok():
            return
        close_price = self.data.Close[-1]
        upper_band = self.bollinger["upper"][-1]
        lower_band = self.bollinger["lower"][-1]
        rsi_value = self.rsi[-1]
        if close_price > upper_band and rsi_value > self.rsi_thresholds[1]:
            self.position.enter_short(lots_by_risk_pct(self.spec, self.equity, self.data))
            self.sl_price = close_price + self.atr[-1] * self.atr_multiplier
            self.tp_price = lower_band
        elif close_price < lower_band and rsi_value < self.rsi_thresholds[0]:
            self.position.enter_long(lots_by_risk_pct(self.spec, self.equity, self.data))
            self.sl_price = close_price - self.atr[-1] * self.atr_multiplier
            self.tp_price = upper_band

    def _manage_open(self):
        if not self.position:
            return
        time_stop = self.spec["exit_rule"]["params"]["time_stop"]["params"]["bars"]
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        take_profit = self.spec["exit_rule"]["params"]["take_profit"]["type"] == "opposite_bb"
        if take_profit:
            close_price = self.data.Close[-1]
            upper_band = self.bollinger["upper"][-1]
            lower_band = self.bollinger["lower"][-1]
            if self.position.is_long and close_price >= upper_band:
                self.position.close()
            elif self.position.is_short and close_price <= lower_band:
                self.position.close()
        stop_loss = self.spec["exit_rule"]["params"]["stop_loss"]["type"] == "atr"
        if stop_loss:
            atr_now = self.atr[-1]
            price = self.data.Close[-1]
            if self.position.is_long and price <= self.sl_price:
                self.position.close()
            elif self.position.is_short and price >= self.sl_price:
                self.position.close()