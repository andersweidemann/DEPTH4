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
        self.I(signals.bollinger, self.data, n=20)
        self.I(rsi, self.data, n=7)
        self.I(atr, self.data, n=14)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_val = float(self.I(bb_width, self.data, n=20)[-1])
        min_width = rf.get("params", {}).get("min_width")
        max_width = rf.get("params", {}).get("max_width")
        if min_width is not None and bb_width_val < min_width:
            return False
        if max_width is not None and bb_width_val > max_width:
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.1)):
            return False
        return True

    def _enter_if_signal(self) -> None:
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules.get("long", {}).get("condition")
            short_condition = entry_rules.get("short", {}).get("condition")
            if long_condition and short_condition:
                close = float(self.data.Close[-1])
                lower_bb = float(self.I(bollinger, self.data, n=20)[0][-1])
                upper_bb = float(self.I(bollinger, self.data, n=20)[1][-1])
                rsi_val = float(self.I(rsi, self.data, n=7)[-1])
                if close > lower_bb and rsi_val < 10:
                    self.position.open(long=True, size=lots_by_risk_pct(self.spec, self.equity, self.data))
                    self.sl_price = float(self.data.Close[-1]) - 1.5 * float(self.I(atr, self.data, n=14)[-1])
                    self.tp_price = float(self.I(bollinger, self.data, n=20)[1][-1])
                elif close < upper_bb and rsi_val > 90:
                    self.position.open(long=False, size=lots_by_risk_pct(self.spec, self.equity, self.data))
                    self.sl_price = float(self.data.Close[-1]) + 1.5 * float(self.I(atr, self.data, n=14)[-1])
                    self.tp_price = float(self.I(bollinger, self.data, n=20)[0][-1])

    def _manage_open(self) -> None:
        exit_rules = self.spec.get("exit_rules")
        if exit_rules:
            time_stop = exit_rules.get("time_stop", {}).get("params", {}).get("num_bars")
            if time_stop is not None:
                trade = self.trades[-1] if self.trades else None
                if trade is not None:
                    bars_open = len(self.data) - trade.entry_bar
                    if bars_open >= time_stop:
                        self.position.close()
            tp_type = exit_rules.get("tp", {}).get("type")
            if tp_type == "opposite_bb":
                if self.position.is_long:
                    self.tp_price = float(self.I(bollinger, self.data, n=20)[1][-1])
                else:
                    self.tp_price = float(self.I(bollinger, self.data, n=20)[0][-1])
            sl_type = exit_rules.get("sl", {}).get("type")
            if sl_type == "atr":
                multiplier = exit_rules.get("sl", {}).get("params", {}).get("multiplier")
                if multiplier is not None:
                    self.sl_price = float(self.data.Close[-1]) - multiplier * float(self.I(atr, self.data, n=14)[-1]) if self.position.is_long else float(self.data.Close[-1]) + multiplier * float(self.I(atr, self.data, n=14)[-1])