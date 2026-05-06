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
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {})
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(signals.session_mask(full_idx, [{"start_hour": sessions["start_hour"], "end_hour": sessions["end_hour"]}])), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._range_atr = self.I(signals.donchian, self.data, 14)

    def _regime_ok(self):
        return self._session_mask_full[-1] if self._session_mask_full is not None else True

    def _filters_ok(self):
        return self._regime_ok()

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules", {})
        long_condition = entry_rules.get("long", {}).get("condition", "")
        short_condition = entry_rules.get("short", {}).get("condition", "")
        breakout = self._atr_series[-1]
        range_atr = self._range_atr[-1]
        if long_condition and eval(long_condition):
            self.position.open_long()
            self.sl_price = self.data.Close[-1] - 100 * self.data.pip
            self.tp_price = self.data.Close[-1] + 500 * self.data.pip
        elif short_condition and eval(short_condition):
            self.position.open_short()
            self.sl_price = self.data.Close[-1] + 100 * self.data.pip
            self.tp_price = self.data.Close[-1] - 500 * self.data.pip

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_hours", 0)
        if not self.position:
            return
        if time_stop:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop * 60:
                    self.position.close()
                    return
        stop_loss = exit_cfg.get("stop_loss", {}).get("params", {}).get("pips", 0)
        take_profit = exit_cfg.get("take_profit", {}).get("params", {}).get("pips", 0)
        if self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
            self.position.close()
        if self.position.is_long and self.data.Close[-1] <= self.sl_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
            self.position.close()