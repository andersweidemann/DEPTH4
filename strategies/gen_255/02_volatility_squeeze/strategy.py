import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "GER40"
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
        self.I(signals.atr, self.data, 14)
        self.I(signals.bollinger, self.data, 20, 2.0)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        atr_percentile_val = float(self.I(signals.atr_percentile, self.data, 14)[-1])
        if atr_percentile_val < 20:
            return True
        return False

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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.1)):
            return False
        return True

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules", {})
        long_rule = entry_rules.get("long")
        short_rule = entry_rules.get("short")
        atr_val = float(self.I(signals.atr, self.data, 14)[-1])
        atr_prev = float(self.I(signals.atr, self.data, 14)[-2])
        close = float(self.data.Close[-1])
        upper_bollinger_band = float(self.I(signals.bollinger, self.data, 20, 2.0)[0][-1])
        lower_bollinger_band = float(self.I(signals.bollinger, self.data, 20, 2.0)[1][-1])
        if long_rule and close > upper_bollinger_band and atr_val > atr_prev:
            self.sl_price = close - 1.5 * atr_val
            self.tp_price = close + 2 * atr_val
            point_size = self.spec.get("point_size", 0.1)
            sl_points = abs(close - self.sl_price) / point_size
            lots = lots_by_risk_pct(float(self.equity), sl_points, 0.02, self._symbol)
            self.buy(size=lots, sl=self.sl_price, tp=self.tp_price)
        elif short_rule and close < lower_bollinger_band and atr_val > atr_prev:
            self.sl_price = close + 1.5 * atr_val
            self.tp_price = close - 2 * atr_val
            point_size = self.spec.get("point_size", 0.1)
            sl_points = abs(close - self.sl_price) / point_size
            lots = lots_by_risk_pct(float(self.equity), sl_points, 0.02, self._symbol)
            self.sell(size=lots, sl=self.sl_price, tp=self.tp_price)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        trail_mult = exit_cfg.get("trail_atr_mult")
        if trail_mult and hasattr(self, "_atr_series") and self.trades:
            atr_now = float(self.I(signals.atr, self.data, 14)[-1])
            if not np.isnan(atr_now):
                price = float(self.data.Close[-1])
                for trade in self.trades:
                    if trade.is_long and trade.pl_pct > 0:
                        new_sl = price - trail_mult * atr_now
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                    elif not trade.is_long and trade.pl_pct > 0:
                        new_sl = price + trail_mult * atr_now
                        if trade.sl is None or new_sl < trade.sl:
                            trade.sl = new_sl