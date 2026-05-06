import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "XAUUSD"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

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
        self._bb_width_series = self.I(bb_width, self.data, n=self.spec["regime_filter"]["params"]["bb_period"])
        self._rsi_series = self.I(rsi, self.data, n=self.spec["entry_rule"]["params"]["rsi_period"])
        self._bollinger_series = self.I(bollinger, self.data, n=self.spec["regime_filter"]["params"]["bb_period"], dev=self.spec["regime_filter"]["params"]["bb_deviation"])

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_val = float(self._bb_width_series[-1])
        bb_width_percentile = np.percentile(self._bb_width_series, self.spec["regime_filter"]["params"]["percentile"])
        if bb_width_val < bb_width_percentile:
            return False
        return True

    def _filters_ok(self) -> bool:
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

    def _enter_if_signal(self) -> None:
        er = self.spec.get("entry_rule")
        if not er:
            return
        rsi_val = float(self._rsi_series[-1])
        if rsi_val < er["params"]["rsi_thresholds"][0] or rsi_val > er["params"]["rsi_thresholds"][1]:
            close_val = float(self.data.Close[-1])
            upper_band = self._bollinger_series[-1][2]
            lower_band = self._bollinger_series[-1][0]
            if close_val < lower_band or close_val > upper_band:
                self.sl_price = close_val - (self.spec["exit_rule"]["params"]["sl_multiplier"] * (upper_band - lower_band)) if close_val < lower_band else close_val + (self.spec["exit_rule"]["params"]["sl_multiplier"] * (upper_band - lower_band))
                lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data)
                self.position.enter(lots)

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("time_stop_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if self.position:
            close_val = float(self.data.Close[-1])
            upper_band = self._bollinger_series[-1][2]
            lower_band = self._bollinger_series[-1][0]
            if close_val < lower_band and self.position.is_long:
                self.position.close()
            elif close_val > upper_band and not self.position.is_long:
                self.position.close()