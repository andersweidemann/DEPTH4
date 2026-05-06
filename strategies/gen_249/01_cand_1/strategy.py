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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("start_hour") and self.spec.get("regime_filter", {}).get("params", {}).get("end_hour")
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, [(self.spec.get("regime_filter", {}).get("params", {}).get("start_hour"), self.spec.get("regime_filter", {}).get("params", {}).get("end_hour"))]), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._atr_series = self.I(atr, self.data, self.spec.get("entry_rule", {}).get("params", {}).get("atr_period"))
        self._donchian_series = self.I(donchian, self.data, self.spec.get("entry_rule", {}).get("params", {}).get("atr_period"))
        self._bb_width_series = self.I(bb_width, self.data, self.spec.get("exit_rule", {}).get("params", {}).get("period", 20))

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "session":
            return self._session_mask_full[-1] if self._session_mask_full is not None else True
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self):
        entry_cfg = self.spec.get("entry_rule", {})
        if entry_cfg.get("type") == "asia_london_range_expansion":
            atr_now = float(self._atr_series[-1])
            donchian_now = float(self._donchian_series[-1])
            min_range_atr = entry_cfg.get("params", {}).get("min_range_atr")
            max_range_atr = entry_cfg.get("params", {}).get("max_range_atr")
            if atr_now > min_range_atr and atr_now < max_range_atr:
                if donchian_now > self.data.High[-1]:
                    self.position.open(long=True, size=lots_by_risk_pct(self.spec.get("sizing_rule", {}).get("params", {}).get("lots"), self._equity_start, self.spec.get("risk", {}).get("risk_pct", 0.02)))
                    self.sl_price = self.data.Close[-1] - self.spec.get("sl_rule", {}).get("params", {}).get("pips")
                    self.tp_price = self.data.Close[-1] + self.spec.get("tp_rule", {}).get("params", {}).get("pips")
                elif donchian_now < self.data.Low[-1]:
                    self.position.open(long=False, size=lots_by_risk_pct(self.spec.get("sizing_rule", {}).get("params", {}).get("lots"), self._equity_start, self.spec.get("risk", {}).get("risk_pct", 0.02)))
                    self.sl_price = self.data.Close[-1] + self.spec.get("sl_rule", {}).get("params", {}).get("pips")
                    self.tp_price = self.data.Close[-1] - self.spec.get("tp_rule", {}).get("params", {}).get("pips")

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        bb_width_now = float(self._bb_width_series[-1])
        if bb_width_now > 0:
            for trade in self.trades:
                if trade.is_long and trade.pl_pct > 0:
                    new_sl = self.data.Close[-1] - bb_width_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
                elif not trade.is_long and trade.pl_pct > 0:
                    new_sl = self.data.Close[-1] + bb_width_now
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl