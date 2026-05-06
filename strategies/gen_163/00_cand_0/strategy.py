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
        self.upper_bb, self.middle_bb, self.lower_bb = self.I(bollinger, self.data, n=20)
        self.rsi = self.I(rsi, self.data, n=7)
        self.bb_width = self.I(bb_width, self.data, n=20)
        self._regime_series = self.I(bb_width, self.data, n=20)
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "bb_width_percentile":
            bb_width_val = float(self.bb_width[-1])
            percentile = rf.get("params", {}).get("percentile")
            lookback = rf.get("params", {}).get("lookback")
            bb_width_series = self.bb_width[-lookback:]
            threshold = np.percentile(bb_width_series, percentile)
            return bb_width_val < threshold
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
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules.get("long", {}).get("condition")
            short_condition = entry_rules.get("short", {}).get("condition")
            if long_condition and short_condition:
                if self.rsi[-1] < 10 and self.data.Close[-1] < self.lower_bb[-1]:
                    self.position.enter_long(lots_by_risk_pct(self.spec, self._equity_start, self.data))
                    self.sl_price = self.data.Close[-1] - 1.5 * self.I(atr, self.data, n=14)[-1]
                    self.tp_price = self.upper_bb[-1]
                elif self.rsi[-1] > 90 and self.data.Close[-1] > self.upper_bb[-1]:
                    self.position.enter_short(lots_by_risk_pct(self.spec, self._equity_start, self.data))
                    self.sl_price = self.data.Close[-1] + 1.5 * self.I(atr, self.data, n=14)[-1]
                    self.tp_price = self.lower_bb[-1]

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rules")
        if exit_cfg:
            time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_bars")
            if time_stop is not None:
                trade = self.trades[-1] if self.trades else None
                if trade is not None:
                    bars_open = len(self.data) - trade.entry_bar
                    if bars_open >= time_stop:
                        self.position.close()
            stop_loss = exit_cfg.get("stop_loss", {}).get("params", {}).get("multiplier")
            if stop_loss is not None:
                atr_now = float(self.I(atr, self.data, n=14)[-1])
                price = float(self.data.Close[-1])
                for trade in self.trades:
                    if trade.is_long and trade.pl_pct > 0:
                        new_sl = price - stop_loss * atr_now
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                    elif not trade.is_long and trade.pl_pct > 0:
                        new_sl = price + stop_loss * atr_now
                        if trade.sl is None or new_sl < trade.sl:
                            trade.sl = new_sl