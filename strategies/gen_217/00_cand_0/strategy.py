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
        self.sl_multiplier = self.spec["exit_rule"]["params"]["sl_multiplier"]
        self.time_stop_bars = self.spec["exit_rule"]["params"]["time_stop_bars"]
        self.fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self.I_bollinger = self.I(bollinger, self.data.Close, self.bb_period, self.bb_deviation)
        self.I_rsi = self.I(rsi, self.data.Close, self.rsi_period)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        ind = rf.get("indicator", "adx")
        if ind == "adx":
            adx_val = float(self._adx_series[-1]) if hasattr(self, "_adx_series") else np.nan
            if np.isnan(adx_val):
                return False
            mn = rf.get("min")
            mx = rf.get("max")
            if mn is not None and adx_val < mn:
                return False
            if mx is not None and adx_val > mx:
                return False
            return True
        if ind == "classify":
            allowed = rf.get("allowed", ["TREND"])
            reg = self._regime_series[-1] if hasattr(self, "_regime_series") else "RANGE"
            return reg in allowed
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"])):
            return False
        return True

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            upper_bb = self.I_bollinger["upper"][-1]
            lower_bb = self.I_bollinger["lower"][-1]
            close = self.data.Close[-1]
            rsi = self.I_rsi[-1]
            if (close >= upper_bb and rsi >= self.rsi_thresholds[1]) or (close <= lower_bb and rsi <= self.rsi_thresholds[0]):
                lots = lots_by_risk_pct(self.equity, self.spec["sizing_rule"]["params"]["fraction"])
                if close >= upper_bb:
                    self.position.open_short(lots)
                else:
                    self.position.open_long(lots)
                self.sl_price = close * (1 - self.sl_multiplier * self.bb_deviation / self.bb_period)
                self.tp_price = close * (1 + self.sl_multiplier * self.bb_deviation / self.bb_period)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return