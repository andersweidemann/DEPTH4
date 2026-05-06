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
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(signals.session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.bb = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_dev"])
        self.rsi = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self.atr = self.I(atr, self.data, 14)

    def _regime_ok(self):
        bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"])
        percentile = np.percentile(bb_width, self.spec["regime_filter"]["params"]["percentile"])
        return bb_width[-1] > percentile

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
            if not risk.spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"])):
            return False
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        if self.rsi[-1] < self.spec["entry_rule"]["params"]["rsi_thresholds"][0] and self.data.Close[-1] < self.bb["lower"][-1]:
            self.sl_price = self.data.Close[-1] - 2 * self.atr[-1]
            self.tp_price = self.bb["middle"][-1]
            self.position = self.enter_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data.Close[-1], self.sl_price))
        elif self.rsi[-1] > self.spec["entry_rule"]["params"]["rsi_thresholds"][1] and self.data.Close[-1] > self.bb["upper"][-1]:
            self.sl_price = self.data.Close[-1] + 2 * self.atr[-1]
            self.tp_price = self.bb["middle"][-1]
            self.position = self.enter_short(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data.Close[-1], self.sl_price))

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if exit_cfg.get("tp") == "middle_bb":
            if self.position.is_long and self.data.Close[-1] >= self.bb["middle"][-1]:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.bb["middle"][-1]:
                self.position.close()
        if exit_cfg.get("sl") == "2_atr":
            if self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()