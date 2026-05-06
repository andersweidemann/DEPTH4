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
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._atr_series = self.I(atr, self.data, 14)
        self._atr_percentile = self.I(atr_percentile, self.data, self.spec["regime_filter"]["params"]["lookback"], self.spec["regime_filter"]["params"]["percentile"])
        self._rsi_series = self.I(rsi, self.data, 7)
        self._bb_series = self.I(bollinger, self.data, 14)
        self._lower_bb = self._bb_series[:, 0]
        self._upper_bb = self._bb_series[:, 1]

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        ind = rf.get("indicator", "adx")
        if ind == "atr_percentile":
            atr_now = float(self._atr_series[-1])
            atr_percentile_now = float(self._atr_percentile[-1])
            return atr_now > atr_percentile_now
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.1)):
            return False
        return True

    def _enter_if_signal(self):
        close = float(self.data.Close[-1])
        rsi_now = float(self._rsi_series[-1])
        atr_now = float(self._atr_series[-1])
        atr_percentile_now = float(self._atr_percentile[-1])
        lower_bb_now = float(self._lower_bb[-1])
        upper_bb_now = float(self._upper_bb[-1])
        if close < lower_bb_now and rsi_now < 10 and atr_now > atr_percentile_now:
            self.position.enter_long()
            self.sl_price = close - self.spec["exit_rules"]["sl"]["params"]["multiplier"] * atr_now
            self.tp_price = upper_bb_now
        elif close > upper_bb_now and rsi_now > 90 and atr_now > atr_percentile_now:
            self.position.enter_short()
            self.sl_price = close + self.spec["exit_rules"]["sl"]["params"]["multiplier"] * atr_now
            self.tp_price = lower_bb_now

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
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
        atr_now = float(self._atr_series[-1])
        if atr_now > 0:
            trail_mult = exit_cfg.get("sl", {}).get("params", {}).get("multiplier")
            if trail_mult is not None:
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