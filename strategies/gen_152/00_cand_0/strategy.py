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
        self._bb = self.I(bollinger, self.data, 20)
        self._rsi = self.I(rsi, self.data, 7)
        self._atr = self.I(atr, self.data, 14)
        self._bb_width = self.I(bb_width, self.data, 20)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "bb_width_percentile":
            bb_width_val = float(self._bb_width[-1])
            percentile = rf.get("params", {}).get("percentile")
            lookback = rf.get("params", {}).get("lookback")
            if lookback is not None and percentile is not None:
                bb_widths = self._bb_width[-lookback:]
                threshold = np.percentile(bb_widths, percentile)
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
            close = float(self.data.Close[-1])
            upper_bb = float(self._bb['upper'][-1])
            lower_bb = float(self._bb['lower'][-1])
            rsi_val = float(self._rsi[-1])
            if long_condition and close < lower_bb and rsi_val < 10:
                self.position.enter(long=True, size=lots_by_risk_pct(self.spec, self.equity, self.data))
                self.sl_price = close - 1.5 * float(self._atr[-1])
                self.tp_price = upper_bb
            elif short_condition and close > upper_bb and rsi_val > 90:
                self.position.enter(long=False, size=lots_by_risk_pct(self.spec, self.equity, self.data))
                self.sl_price = close + 1.5 * float(self._atr[-1])
                self.tp_price = lower_bb

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
                        return
            atr_mult = exit_cfg.get("sl", {}).get("params", {}).get("multiplier")
            if atr_mult is not None:
                atr_val = float(self._atr[-1])
                if self.position.is_long:
                    new_sl = float(self.data.Close[-1]) - atr_mult * atr_val
                    if self.sl_price is None or new_sl > self.sl_price:
                        self.sl_price = new_sl
                else:
                    new_sl = float(self.data.Close[-1]) + atr_mult * atr_val
                    if self.sl_price is None or new_sl < self.sl_price:
                        self.sl_price = new_sl
            opposite_bb = exit_cfg.get("tp", {}).get("type") == "opposite_bb"
            if opposite_bb:
                if self.position.is_long:
                    self.tp_price = float(self._bb['upper'][-1])
                else:
                    self.tp_price = float(self._bb['lower'][-1])