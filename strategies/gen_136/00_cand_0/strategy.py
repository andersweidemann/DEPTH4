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

        bb_period = self.spec["entry_rule"]["params"]["bb_period"]
        bb_deviation = self.spec["entry_rule"]["params"]["bb_deviation"]
        rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]

        self._bb_series = self.I(bollinger, self.data, bb_period, bb_deviation)
        self._rsi_series = self.I(rsi, self.data, rsi_period)

        self._atr_series = self.I(atr, self.data, 20)

        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None

        self._broker_spread_points = 0

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True

        if rf["type"] == "bb_width_percentile":
            percentile = rf["params"]["percentile"]
            lookback = rf["params"]["lookback"]
            bb_width_series = self.I(bb_width, self.data, lookback)
            bb_width_percentile = np.percentile(bb_width_series[-lookback:], percentile)
            return bb_width_series[-1] < bb_width_percentile

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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 10)):
            return False

        return True

    def _enter_if_signal(self):
        if not self.position:
            bb_series = self._bb_series
            rsi_series = self._rsi_series
            close_price = self.data.Close[-1]

            if close_price < bb_series[-1][0] and rsi_series[-1] < 30:
                self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data))
                self.sl_price = close_price - 1.5 * self._atr_series[-1]
                self.tp_price = bb_series[-1][1]

            elif close_price > bb_series[-1][1] and rsi_series[-1] > 70:
                self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data))
                self.sl_price = close_price + 1.5 * self._atr_series[-1]
                self.tp_price = bb_series[-1][0]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop", 30)

        if not self.position:
            return

        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar

        if bars_open >= time_stop:
            self.position.close()
            return

        if exit_cfg.get("tp") == "opposite_bb":
            bb_series = self._bb_series
            if self.position.is_long and self.data.Close[-1] >= bb_series[-1][1]:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= bb_series[-1][0]:
                self.position.close()

        if exit_cfg.get("sl") == "1.5_atr":
            atr_series = self._atr_series
            if self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()