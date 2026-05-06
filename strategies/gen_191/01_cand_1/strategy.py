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
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.atr_series = self.I(signals.atr, self.data, 14)
        self.atr_percentile_series = self.I(agents.regime.atr_percentile, self.data, 14, 70)
        self.upper_range = self.I(signals.donchian, self.data, 14).max
        self.lower_range = self.I(signals.donchian, self.data, 14).min

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        ind = rf.get("indicator", "atr_percentile")
        if ind == "atr_percentile":
            atr_percentile_val = float(self.atr_percentile_series[-1])
            if np.isnan(atr_percentile_val):
                return False
            mn = rf.get("min")
            mx = rf.get("max")
            if mn is not None and atr_percentile_val < mn:
                return False
            if mx is not None and atr_percentile_val > mx:
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
        if self._regime_ok() and self._filters_ok():
            close = float(self.data.Close[-1])
            if close > self.upper_range and float(self.atr_series[-1]) > float(self.atr_percentile_series[-1]):
                lots = lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("risk_percent", 2), self.equity, self.data)
                self.position.open(long=True, lots=lots)
                self.sl_price = close - 100 * self.data.pip
                self.tp_price = close + 500 * self.data.pip
            elif close < self.lower_range and float(self.atr_series[-1]) > float(self.atr_percentile_series[-1]):
                lots = lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("risk_percent", 2), self.equity, self.data)
                self.position.open(long=False, lots=lots)
                self.sl_price = close + 100 * self.data.pip
                self.tp_price = close - 500 * self.data.pip

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("hours", 0)
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop * 60 // self.data.tframe_m:
                    self.position.close()
                    return
        stop_loss = exit_cfg.get("stop_loss", {}).get("pips", 0)
        take_profit = exit_cfg.get("take_profit", {}).get("pips", 0)
        if self.position.is_long and float(self.data.Close[-1]) >= self.tp_price:
            self.position.close()
        elif not self.position.is_long and float(self.data.Close[-1]) <= self.tp_price:
            self.position.close()
        elif self.position.is_long and float(self.data.Close[-1]) <= self.sl_price:
            self.position.close()
        elif not self.position.is_long and float(self.data.Close[-1]) >= self.sl_price:
            self.position.close()