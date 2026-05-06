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
        self._bb_period = self.spec["regime_filter"]["params"]["bb_period"]
        self._bb_deviation = self.spec["regime_filter"]["params"]["bb_deviation"]
        self._rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self._rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self._tp_price = None
        self._sl_price = None
        self._bb = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._rsi = self.I(rsi, self.data, self._rsi_period)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        bb_width_val = float(self.I(bb_width, self.data, self._bb_period, self._bb_deviation)[-1])
        percentile = rf["params"]["percentile"]
        bb_width_percentile = np.percentile(self.I(bb_width, self.data, self._bb_period, self._bb_deviation), percentile)
        return bb_width_val > bb_width_percentile

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
            bb_lower = float(self._bb['lower'][-1])
            bb_upper = float(self._bb['upper'][-1])
            rsi = float(self._rsi[-1])
            if close < bb_lower and rsi < self._rsi_thresholds[0]:
                self.position.enter(long=True)
                self._sl_price = close - 2 * float(self.I(atr, self.data, 20)[-1])
                self._tp_price = float(self._bb['middle'][-1])
            elif close > bb_upper and rsi > self._rsi_thresholds[1]:
                self.position.enter(long=False)
                self._sl_price = close + 2 * float(self.I(atr, self.data, 20)[-1])
                self._tp_price = float(self._bb['middle'][-1])

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("params", {}).get("conditions", [{}])[2].get("params", {}).get("time_stop_bar")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        take_profit = exit_cfg.get("params", {}).get("conditions", [{}])[0].get("params", {}).get("tp_price")
        if take_profit == "middle_bb":
            tp_price = float(self._bb['middle'][-1])
            if self.position.is_long and self.data.Close[-1] >= tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= tp_price:
                self.position.close()
        stop_loss = exit_cfg.get("params", {}).get("conditions", [{}])[1].get("params", {}).get("sl_price")
        if stop_loss == "2_atr":
            sl_price = float(self._sl_price)
            if self.position.is_long and self.data.Close[-1] <= sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= sl_price:
                self.position.close()