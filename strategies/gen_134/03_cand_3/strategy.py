import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "US500"
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
        self._adx_series = self.I(adx, self.data, 14)
        self._atr_series = self.I(atr, self.data, 14)
        self._rsi_series = self.I(rsi, self.data, 14)
        self._bb_series = self.I(bollinger, self.data, 20, 2)
        self._lower_bb = self._bb_series[0]
        self._upper_bb = self._bb_series[1]

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        ind = rf.get("type")
        if ind == "adx":
            adx_val = float(self._adx_series[-1])
            if np.isnan(adx_val):
                return False
            threshold = rf.get("params", {}).get("threshold", 20)
            if adx_val < threshold:
                return False
            return True
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0)):
            return False
        return True

    def _enter_if_signal(self) -> None:
        entry_cfg = self.spec.get("entry_rules")
        long_condition = entry_cfg.get("long", {}).get("condition")
        short_condition = entry_cfg.get("short", {}).get("condition")
        if long_condition and short_condition:
            close = float(self.data.Close[-1])
            lower_bb = float(self._lower_bb[-1])
            upper_bb = float(self._upper_bb[-1])
            rsi = float(self._rsi_series[-1])
            if close < lower_bb and rsi < 30:
                self.position.enter_long()
                self.sl_price = close - 1.2 * float(self._atr_series[-1])
                self.tp_price = upper_bb
            elif close > upper_bb and rsi > 70:
                self.position.enter_short()
                self.sl_price = close + 1.2 * float(self._atr_series[-1])
                self.tp_price = lower_bb

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_hours", 1)
        if not self.position:
            return
        trade = self.trades[-1] if self.trades else None
        if trade is not None:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop * 60:
                self.position.close()
                return
            atr_now = float(self._atr_series[-1])
            price = float(self.data.Close[-1])
            if trade.is_long and trade.pl_pct > 0:
                new_sl = price - 1.2 * atr_now
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl
            elif not trade.is_long and trade.pl_pct > 0:
                new_sl = price + 1.2 * atr_now
                if trade.sl is None or new_sl < trade.sl:
                    trade.sl = new_sl