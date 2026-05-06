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
        self.upper_bb, self.lower_bb = self.I(bollinger, self.data, n=20)
        self.rsi = self.I(rsi, self.data, n=14)
        self.atr = self.I(atr, self.data, n=14)

    def _regime_ok(self):
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.1)):
            return False
        return True

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules.get("long", {}).get("condition")
            short_condition = entry_rules.get("short", {}).get("condition")
            if long_condition and eval(long_condition):
                self.position.enter_long()
                self.sl_price = self.data.Close[-1] - 1.5 * self.atr[-1]
                self.tp_price = self.upper_bb[-1]
            elif short_condition and eval(short_condition):
                self.position.enter_short()
                self.sl_price = self.data.Close[-1] + 1.5 * self.atr[-1]
                self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        take_profit = exit_cfg.get("take_profit", {}).get("type") == "opposite_bb"
        if take_profit:
            if self.position.is_long and self.data.Close[-1] >= self.upper_bb[-1]:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.lower_bb[-1]:
                self.position.close()
        stop_loss = exit_cfg.get("stop_loss", {}).get("type") == "atr"
        if stop_loss:
            atr_mult = exit_cfg.get("stop_loss", {}).get("params", {}).get("multiplier")
            if atr_mult is not None:
                self.sl_price = self.data.Close[-1] - atr_mult * self.atr[-1] if self.position.is_long else self.data.Close[-1] + atr_mult * self.atr[-1]