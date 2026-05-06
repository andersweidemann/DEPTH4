import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "BTCUSD"
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
        self._bb_width_series = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"])
        self._rsi_series = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self._bb_series = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self._atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self):
        bb_width_val = float(self._bb_width_series[-1])
        percentile = self.spec["regime_filter"]["params"]["percentile"]
        bb_width_percentile = np.percentile(self._bb_width_series, percentile)
        return bb_width_val > bb_width_percentile

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        rsi_val = float(self._rsi_series[-1])
        rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        if rsi_val < rsi_thresholds[0] or rsi_val > rsi_thresholds[1]:
            price = float(self.data.Close[-1])
            bb_middle = float(self._bb_series[-1][1])
            atr_val = float(self._atr_series[-1])
            sl_p = price - self.spec["exit_rule"]["params"]["sl"] * atr_val if self.position else None
            tp_p = bb_middle if self.position else None
            self.sl_price = sl_p
            self.tp_price = tp_p
            self.position.entry()

    def _manage_open(self):
        exit_cfg = self.spec["exit_rule"]
        time_stop = exit_cfg["time_stop"]
        if not self.position:
            return
        trade = self.trades[-1] if self.trades else None
        if trade is not None:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        tp = exit_cfg["tp"]
        if tp == "middle_bb":
            tp_p = float(self._bb_series[-1][1])
            if self.position.is_long and self.data.Close[-1] >= tp_p:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= tp_p:
                self.position.close()
        sl_p = exit_cfg["sl"] * float(self._atr_series[-1])
        if self.position.is_long and self.data.Close[-1] <= self.sl_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
            self.position.close()