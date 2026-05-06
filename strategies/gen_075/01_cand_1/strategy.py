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
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(signals.session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._atr_series = self.I(atr, self.data, self.spec["regime_filter"]["params"]["atr_period"])
        self._asia_range_high = self.I(donchian, self.data, self.spec["entry_rule"]["params"]["asia_range_hours"][1])
        self._asia_range_low = self.I(donchian, self.data, self.spec["entry_rule"]["params"]["asia_range_hours"][1], kind="low")

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        atr_now = float(self._atr_series[-1])
        atr_percentile = atr_percentile(self._atr_series, rf["params"]["percentile"])
        if atr_now > atr_percentile:
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
            if not risk.spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"])):
            return False
        return True

    def _enter_if_signal(self):
        er = self.spec.get("entry_rule")
        if er["type"] == "london_breakout":
            asia_range_high = float(self._asia_range_high[-1])
            asia_range_low = float(self._asia_range_low[-1])
            current_price = float(self.data.Close[-1])
            if current_price > asia_range_high and self._regime_ok():
                self.sl_price = asia_range_low
                self.tp_price = current_price + self.spec["exit_rule"]["params"]["tp"]["params"]["pips"]
                self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._symbol, self.equity))
            elif current_price < asia_range_low and self._regime_ok():
                self.sl_price = asia_range_high
                self.tp_price = current_price - self.spec["exit_rule"]["params"]["tp"]["params"]["pips"]
                self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._symbol, self.equity))

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("time_stop", {}).get("bars")
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
            atr_now = float(self._atr_series[-1])
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