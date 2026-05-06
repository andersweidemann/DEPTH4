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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("start_hour") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(signals.session_mask(full_idx, [(7, 10)]), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._high = self.data.High
        self._low = self.data.Low
        self._close = self.data.Close
        self._range_atr = self.I(signals.atr, self.data, 20)
        self._donchian_high = self.I(signals.donchian, self.data, 20, 'high')
        self._donchian_low = self.I(signals.donchian, self.data, 20, 'low')

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour")
        end_hour = rf.get("params", {}).get("end_hour")
        current_hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= current_hour < end_hour

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
        entry_cfg = self.spec.get("entry_rule")
        if entry_cfg.get("type") == "range_expansion":
            range_atr_min = entry_cfg.get("params", {}).get("range_atr_min")
            range_atr_max = entry_cfg.get("params", {}).get("range_atr_max")
            breakout_threshold = entry_cfg.get("params", {}).get("breakout_threshold")
            current_range = self._high[-1] - self._low[-1]
            current_atr = self._range_atr[-1]
            if range_atr_min <= current_range / current_atr <= range_atr_max:
                if self._high[-1] > self._donchian_high[-1] * breakout_threshold:
                    self.position.enter_long(lots_by_risk_pct(self.spec, self._equity_start, self.data))
                    self.sl_price = self._low[-1]
                    self.tp_price = self._high[-1] + breakout_threshold * current_atr
                elif self._low[-1] < self._donchian_low[-1] / breakout_threshold:
                    self.position.enter_short(lots_by_risk_pct(self.spec, self._equity_start, self.data))
                    self.sl_price = self._high[-1]
                    self.tp_price = self._low[-1] - breakout_threshold * current_atr

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule")
        if exit_cfg.get("type") == "take_profit_and_stop_loss":
            take_profit_pips = exit_cfg.get("params", {}).get("take_profit_pips")
            stop_loss_pips = exit_cfg.get("params", {}).get("stop_loss_pips")
            if self.position:
                if self.position.is_long:
                    if self._close[-1] >= self.position.entry_price + take_profit_pips * self.data._pip:
                        self.position.close()
                    elif self._close[-1] <= self.position.entry_price - stop_loss_pips * self.data._pip:
                        self.position.close()
                elif self.position.is_short:
                    if self._close[-1] <= self.position.entry_price - take_profit_pips * self.data._pip:
                        self.position.close()
                    elif self._close[-1] >= self.position.entry_price + stop_loss_pips * self.data._pip:
                        self.position.close()