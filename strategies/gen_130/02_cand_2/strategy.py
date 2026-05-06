import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
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
        self._bb_width_series = self.I(bb_width, self.data, n=20)
        self._bollinger_series = self.I(bollinger, self.data, n=20, dev=1.75)
        self._atr_series = self.I(atr, self.data, n=20)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "bb_width":
            min_width = rf.get("params", {}).get("min_width")
            if min_width is not None and self._bb_width_series[-1] < min_width:
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
        er = self.spec.get("entry_rule")
        if er.get("type") == "bb_bounce":
            bb_period = er.get("params", {}).get("bb_period")
            bb_deviation = er.get("params", {}).get("bb_deviation")
            if self.data.Close[-1] < self._bollinger_series[-1][0] and self.data.Close[-2] > self._bollinger_series[-2][0]:
                self.sl_price = self.data.Close[-1] - bb_deviation * self._atr_series[-1]
                self.tp_price = self._bollinger_series[-1][1]
                lots = lots_by_risk_pct(self.spec, self.data, self._atr_series)
                self.position.enter(lots)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("params", {}).get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        sl = exit_cfg.get("params", {}).get("sl")
        if sl == "1.5_atr":
            atr_now = float(self._atr_series[-1])
            if not np.isnan(atr_now):
                price = float(self.data.Close[-1])
                if self.position.is_long:
                    new_sl = price - 1.5 * atr_now
                    if self.sl_price is None or new_sl > self.sl_price:
                        self.sl_price = new_sl
                else:
                    new_sl = price + 1.5 * atr_now
                    if self.sl_price is None or new_sl < self.sl_price:
                        self.sl_price = new_sl