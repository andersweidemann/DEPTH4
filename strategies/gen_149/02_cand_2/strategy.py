import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "XAUUSD"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

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
        self.I(rsi, self.data.Close, 7)
        self.I(bollinger, self.data.Close, 20)
        self.I(atr, self.data.High, self.data.Low, self.data.Close, 14)
        self.I(atr_percentile, self.data.High, self.data.Low, self.data.Close, 14, 70)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        ind = rf.get("indicator", "atr_percentile")
        if ind == "atr_percentile":
            atr_percentile_val = float(self.I(atr_percentile, self.data.High, self.data.Low, self.data.Close, 14, 70)[-1])
            if atr_percentile_val > rf.get("percentile", 70):
                return True
            else:
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
        entry_cfg = self.spec.get("entry_rules")
        long_condition = entry_cfg.get("long", {}).get("condition")
        short_condition = entry_cfg.get("short", {}).get("condition")
        if long_condition == "rsi(7) < 10 && close < lower_bb":
            if float(self.I(rsi, self.data.Close, 7)[-1]) < 10 and float(self.data.Close[-1]) < float(self.I(bollinger, self.data.Close, 20)[-1][0]):
                self.position.enter_long(lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("fraction", 0.02), self.data.Close[-1]))
                self.sl_price = float(self.data.Close[-1]) - float(self.I(atr, self.data.High, self.data.Low, self.data.Close, 14)[-1]) * 2
                self.tp_price = float(self.data.Close[-1]) + (float(self.data.Close[-1]) - self.sl_price)
        elif short_condition == "rsi(7) > 90 && close > upper_bb":
            if float(self.I(rsi, self.data.Close, 7)[-1]) > 90 and float(self.data.Close[-1]) > float(self.I(bollinger, self.data.Close, 20)[-1][1]):
                self.position.enter_short(lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("fraction", 0.02), self.data.Close[-1]))
                self.sl_price = float(self.data.Close[-1]) + float(self.I(atr, self.data.High, self.data.Low, self.data.Close, 14)[-1]) * 2
                self.tp_price = float(self.data.Close[-1]) - (self.sl_price - float(self.data.Close[-1]))

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        if self.position.is_long and float(self.data.Close[-1]) >= self.tp_price:
            self.position.close()
        elif self.position.is_short and float(self.data.Close[-1]) <= self.tp_price:
            self.position.close()
        elif self.position.is_long and float(self.data.Close[-1]) <= self.sl_price:
            self.position.close()
        elif self.position.is_short and float(self.data.Close[-1]) >= self.sl_price:
            self.position.close()