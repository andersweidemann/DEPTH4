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
        self.close = self.data.Close
        self.rsi = self.I(rsi, self.data, 7)
        self.lower_bb, self.upper_bb = self.I(bollinger, self.data, 20, 2)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "volatility":
            volatility_period = rf["params"]["volatility_period"]
            volatility_threshold = rf["params"]["volatility_threshold"]
            atr_val = self.I(atr, self.data, volatility_period)[-1]
            return atr_val < volatility_threshold
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
            long_condition = entry_rules["long"]["condition"]
            short_condition = entry_rules["short"]["condition"]
            if long_condition == "close < lower_bb && rsi(7) < 20":
                if self.close[-1] < self.lower_bb[-1] and self.rsi[-1] < 20:
                    self.position.open_long(lots_by_risk_pct(self.spec, self.data, self.equity))
                    self.sl_price = self.close[-1] - self.spec["exit_rules"]["stop_loss"]["params"]["pips"] * 0.0001
                    self.tp_price = self.close[-1] + self.spec["exit_rules"]["take_profit"]["params"]["pips"] * 0.0001
            elif short_condition == "close > upper_bb && rsi(7) > 80":
                if self.close[-1] > self.upper_bb[-1] and self.rsi[-1] > 80:
                    self.position.open_short(lots_by_risk_pct(self.spec, self.data, self.equity))
                    self.sl_price = self.close[-1] + self.spec["exit_rules"]["stop_loss"]["params"]["pips"] * 0.0001
                    self.tp_price = self.close[-1] - self.spec["exit_rules"]["take_profit"]["params"]["pips"] * 0.0001

    def _manage_open(self) -> None:
        exit_rules = self.spec.get("exit_rules")
        if exit_rules:
            time_stop = exit_rules.get("time_stop", {}).get("bars")
            if time_stop is not None:
                trade = self.trades[-1] if self.trades else None
                if trade is not None:
                    bars_open = len(self.data) - trade.entry_bar
                    if bars_open >= time_stop:
                        self.position.close()
            stop_loss = exit_rules.get("stop_loss", {}).get("params", {}).get("pips")
            if stop_loss is not None:
                if self.position.is_long and self.close[-1] < self.sl_price:
                    self.position.close()
                elif not self.position.is_long and self.close[-1] > self.sl_price:
                    self.position.close()
            take_profit = exit_rules.get("take_profit", {}).get("params", {}).get("pips")
            if take_profit is not None:
                if self.position.is_long and self.close[-1] > self.tp_price:
                    self.position.close()
                elif not self.position.is_long and self.close[-1] < self.tp_price:
                    self.position.close()