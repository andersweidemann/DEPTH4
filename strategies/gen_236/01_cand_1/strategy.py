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
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session")
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, [sessions]), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.asia_range = self.I(donchian, self.data, n=50)
        self.london_breakout = self.I(atr_breakout_levels, self.data, n=20)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        return self._session_mask_full[-1] if self._session_mask_full is not None else True

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
        long_condition = self.london_breakout[-1] > 0 and self.asia_range[-1] < 50
        short_condition = self.london_breakout[-1] < 0 and self.asia_range[-1] < 50
        if long_condition and not self.position:
            self.position.enter_long()
            self.sl_price = self.data.Close[-1] - 100
            self.tp_price = self.data.Close[-1] + 200
        elif short_condition and not self.position:
            self.position.enter_short()
            self.sl_price = self.data.Close[-1] + 100
            self.tp_price = self.data.Close[-1] - 200

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        sl_distance = exit_cfg.get("sl", {}).get("params", {}).get("distance")
        tp_distance = exit_cfg.get("tp", {}).get("params", {}).get("distance")
        if sl_distance is not None and tp_distance is not None:
            if self.position.is_long:
                new_sl = self.data.Close[-1] - sl_distance
                new_tp = self.data.Close[-1] + tp_distance
            else:
                new_sl = self.data.Close[-1] + sl_distance
                new_tp = self.data.Close[-1] - tp_distance
            self.sl_price = new_sl
            self.tp_price = new_tp