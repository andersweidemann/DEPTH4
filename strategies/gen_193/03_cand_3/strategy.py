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
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.donchian_channel_high = self.I(signals.donchian, self.data, 20, 'high')
        self.donchian_channel_low = self.I(signals.donchian, self.data, 20, 'low')
        self.upper_bb = self.I(signals.bollinger, self.data, 20, 2.0, 'upper')
        self.lower_bb = self.I(signals.bollinger, self.data, 20, 2.0, 'lower')
        self.atr = self.I(signals.atr, self.data, 14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "atr_percentile":
            atr_percentile_val = self.I(agents.regime.atr_percentile, self.data, rf["params"]["period"], rf["params"]["percentile"])
            return atr_percentile_val > 0
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"])):
            return False
        return True

    def _enter_if_signal(self):
        entry_cfg = self.spec.get("entry_rules")
        if entry_cfg:
            if self.position.is_long:
                if self.data.High[-1] > self.donchian_channel_high[-1] and self.data.Close[-1] > self.upper_bb[-1]:
                    self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["pips"] * self.data.Close[-1] / 100000
                    self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["tp"]["params"]["pips"] * self.data.Close[-1] / 100000
                    size = lots_by_risk_pct(self.spec["sizing_rules"]["params"]["percent"], self._equity_start, self.data.Close[-1], self.sl_price)
                    self.position.open_long(size)
            elif self.position.is_short:
                if self.data.Low[-1] < self.donchian_channel_low[-1] and self.data.Close[-1] < self.lower_bb[-1]:
                    self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["pips"] * self.data.Close[-1] / 100000
                    self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["tp"]["params"]["pips"] * self.data.Close[-1] / 100000
                    size = lots_by_risk_pct(self.spec["sizing_rules"]["params"]["percent"], self._equity_start, self.data.Close[-1], self.sl_price)
                    self.position.open_short(size)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("num_hours")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop * 60:
                    self.position.close()
                    return