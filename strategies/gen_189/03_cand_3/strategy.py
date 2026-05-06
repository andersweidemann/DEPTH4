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
        self._bb_period = self.spec["entry_rule"]["params"]["bb_period"]
        self._bb_deviation = self.spec["entry_rule"]["params"]["bb_deviation"]
        self._rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self._rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self._bollinger_bands = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._rsi = self.I(rsi, self.data, self._rsi_period)
        self._bb_width = self.I(bb_width, self.data, self._bb_period, self._bb_deviation)
        self._atr = self.I(atr, self.data, 14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_percentile = rf.get("percentile")
        current_bb_width = self._bb_width[-1]
        historical_bb_widths = self._bb_width[:-1]
        if len(historical_bb_widths) < rf.get("period"):
            return False
        historical_bb_widths = historical_bb_widths[-rf.get("period"):]

        percentile = np.percentile(historical_bb_widths, bb_width_percentile)
        return current_bb_width > percentile

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
        upper_band = self._bollinger_bands[2][-1]
        lower_band = self._bollinger_bands[0][-1]
        close_price = self.data.Close[-1]
        rsi = self._rsi[-1]
        if (close_price > upper_band and rsi > self._rsi_thresholds[1]) or (close_price < lower_band and rsi < self._rsi_thresholds[0]):
            lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data)
            if close_price > upper_band:
                self.position.open_short(lots)
            else:
                self.position.open_long(lots)
            self.sl_price = self.data.Close[-1] + (1.5 * self._atr[-1]) * (-1 if self.position.is_long else 1)
            self.tp_price = self._bollinger_bands[1][-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if self.tp_price is not None and ((self.position.is_long and self.data.Close[-1] >= self.tp_price) or (not self.position.is_long and self.data.Close[-1] <= self.tp_price)):
            self.position.close()
            return
        if self.sl_price is not None and ((self.position.is_long and self.data.Close[-1] <= self.sl_price) or (not self.position.is_long and self.data.Close[-1] >= self.sl_price)):
            self.position.close()
            return