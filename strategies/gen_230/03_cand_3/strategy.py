import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "US500"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self.rsi = self.I(rsi, self.data.Close, 7)
        self.bb = self.I(bollinger, self.data.Close, 20)
        self.upper_bb = self.bb[:, 2]
        self.lower_bb = self.bb[:, 0]
        self.volatility = self.I(atr, self.data, 14)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "volatility":
            period = rf.get("params", {}).get("period", 14)
            threshold = rf.get("params", {}).get("threshold", 20)
            vol = self.I(atr, self.data, period)[-1]
            return vol > threshold
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
            if not risk.spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"])):
            return False
        return True

    def _enter_if_signal(self) -> None:
        entry_rules = self.spec.get("entry_rules", {})
        long_condition = entry_rules.get("long", {}).get("condition", "")
        short_condition = entry_rules.get("short", {}).get("condition", "")
        if long_condition and self.rsi[-1] < 30 and self.data.Close[-1] < self.lower_bb[-1]:
            self.position.open(long=True, size=lots_by_risk_pct(self.spec, self.data, self.equity))
            self.sl_price = self.data.Close[-1] - self.I(atr, self.data, 14)[-1] * 1.5
            self.tp_price = self.upper_bb[-1]
        elif short_condition and self.rsi[-1] > 70 and self.data.Close[-1] > self.upper_bb[-1]:
            self.position.open(long=False, size=lots_by_risk_pct(self.spec, self.data, self.equity))
            self.sl_price = self.data.Close[-1] + self.I(atr, self.data, 14)[-1] * 1.5
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_bars", 30)
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        tp_type = exit_cfg.get("tp", {}).get("type", "")
        if tp_type == "opposite_bb":
            if self.position.is_long and self.data.Close[-1] > self.upper_bb[-1]:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.lower_bb[-1]:
                self.position.close()
        sl_type = exit_cfg.get("sl", {}).get("type", "")
        if sl_type == "atr":
            atr_mult = exit_cfg.get("sl", {}).get("params", {}).get("multiplier", 1.5)
            atr_period = exit_cfg.get("sl", {}).get("params", {}).get("period", 14)
            atr_val = self.I(atr, self.data, atr_period)[-1]
            if self.position.is_long and self.data.Close[-1] < self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] > self.sl_price:
                self.position.close()