import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "GER40"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._atr_series = self.I(atr, self.data, self.spec["regime_filter"]["params"]["atr_period"])
        self._donchian_series = self.I(donchian, self.data, self.spec["entry_rule"]["params"]["donchian_period"])
        self._session_mask_full = None

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        atr_percentile_val = float(self.I(atr_percentile, self.data, self.spec["regime_filter"]["params"]["atr_period"], self.spec["regime_filter"]["params"]["percentile"]))
        if np.isnan(atr_percentile_val):
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self) -> None:
        er = self.spec.get("entry_rule")
        if er["type"] == "breakout":
            donchian_high = float(self._donchian_series[-1])
            donchian_low = float(self._donchian_series[-2])
            if self.data.Close[-1] > donchian_high:
                self.position.open(long=True)
                self.sl_price = donchian_low
                self.tp_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["tp_pips"] * self.data._pip
            elif self.data.Close[-1] < donchian_low:
                self.position.open(long=False)
                self.sl_price = donchian_high
                self.tp_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["tp_pips"] * self.data._pip

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        if exit_cfg["params"]["sl"] == "2_atr":
            atr_now = float(self._atr_series[-1])
            if not np.isnan(atr_now):
                price = float(self.data.Close[-1])
                if self.position.is_long and self.position.pl_pct > 0:
                    new_sl = price - 2 * atr_now
                    if self.position.sl is None or new_sl > self.position.sl:
                        self.position.sl = new_sl
                elif not self.position.is_long and self.position.pl_pct > 0:
                    new_sl = price + 2 * atr_now
                    if self.position.sl is None or new_sl < self.position.sl:
                        self.position.sl = new_sl