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
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.bollinger_bands = self.I(bollinger, self.data, n=20, dev=1.75)
        self.rsi = self.I(rsi, self.data, n=7)
        self.atr = self.I(atr, self.data, n=14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_percentile = rf.get("type")
        if bb_width_percentile == "bb_width_percentile":
            bb_width_val = float(self.I(bb_width, self.data, n=20)[-1])
            percentile = rf.get("params", {}).get("percentile")
            if bb_width_val < np.percentile(self.I(bb_width, self.data, n=20), percentile):
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules.get("long", {}).get("condition")
            short_condition = entry_rules.get("short", {}).get("condition")
            if long_condition and short_condition:
                close = float(self.data.Close[-1])
                lower_bb = float(self.bollinger_bands[-1][0])
                upper_bb = float(self.bollinger_bands[-1][1])
                rsi_val = float(self.rsi[-1])
                if close < lower_bb and rsi_val < 10:
                    self.position.enter_long(lots_by_risk_pct(self.spec, self.data, self.equity))
                    self.sl_price = float(self.data.Close[-1]) - 1.5 * float(self.atr[-1])
                elif close > upper_bb and rsi_val > 90:
                    self.position.enter_short(lots_by_risk_pct(self.spec, self.data, self.equity))
                    self.sl_price = float(self.data.Close[-1]) + 1.5 * float(self.atr[-1])

    def _manage_open(self):
        exit_rules = self.spec.get("exit_rules")
        if exit_rules:
            stop_loss = exit_rules.get("stop_loss")
            take_profit = exit_rules.get("take_profit")
            time_stop = exit_rules.get("time_stop")
            if stop_loss and take_profit and time_stop:
                if self.position:
                    close = float(self.data.Close[-1])
                    if self.position.is_long:
                        if close < self.sl_price:
                            self.position.close()
                        elif close > self.tp_price:
                            self.position.close()
                    elif self.position.is_short:
                        if close > self.sl_price:
                            self.position.close()
                        elif close < self.tp_price:
                            self.position.close()
                    if time_stop:
                        trade = self.trades[-1]
                        bars_open = len(self.data) - trade.entry_bar
                        if bars_open >= time_stop.get("count"):
                            self.position.close()