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
        self.asia_range_atr_min = self.spec["regime_filter"]["params"]["asia_range_atr_min"]
        self.asia_range_atr_max = self.spec["regime_filter"]["params"]["asia_range_atr_max"]
        self.breakout_threshold = self.spec["entry_rule"]["params"]["breakout_threshold"]
        self.take_profit_pips = self.spec["exit_rule"]["params"]["take_profit_pips"]
        self.stop_loss_pips = self.spec["exit_rule"]["params"]["stop_loss_pips"]
        self.time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        self.fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self.I(signals.atr, self.data, n=14)

    def _regime_ok(self):
        atr_val = float(self.I(signals.atr, self.data, n=14)[-1])
        return self.asia_range_atr_min <= atr_val <= self.asia_range_atr_max

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
            high = self.data.High[-1]
            low = self.data.Low[-1]
            if high > low * (1 + self.breakout_threshold / 100000):
                self.position.open(long=True, size=lots_by_risk_pct(self.equity, self.fraction, self.stop_loss_pips))
                self.sl_price = low - self.stop_loss_pips / 100000
                self.tp_price = high + self.take_profit_pips / 100000

    def _manage_open(self):
        exit_cfg = self.spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        if self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] <= self.sl_price:
            self.position.close()