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
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(signals.session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.lower_bb = self.I(bollinger, self.data, n=20, nbdev=2).lower
        self.upper_bb = self.I(bollinger, self.data, n=20, nbdev=2).upper
        self.rsi = self.I(rsi, self.data, n=7)
        self.bb_width = self.I(bb_width, self.data, n=20)
        self.atr = self.I(atr, self.data, n=20)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "bb_width_percentile":
            bb_width_val = float(self.bb_width[-1])
            percentile = rf["params"]["percentile"]
            lookback = rf["params"]["lookback"]
            bb_widths = self.bb_width[-lookback:]
            threshold = np.percentile(bb_widths, percentile)
            return bb_width_val < threshold
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
            if not risk.spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"])):
            return False
        return True

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules["long"]["condition"]
            short_condition = entry_rules["short"]["condition"]
            if long_condition == "close < lower_bb && rsi(7) < 10":
                if self.data.Close[-1] < self.lower_bb[-1] and self.rsi[-1] < 10:
                    self.position.open_long()
                    self.sl_price = self.data.Close[-1] - 1.5 * self.atr[-1]
                    self.tp_price = self.upper_bb[-1]
            elif short_condition == "close > upper_bb && rsi(7) > 90":
                if self.data.Close[-1] > self.upper_bb[-1] and self.rsi[-1] > 90:
                    self.position.open_short()
                    self.sl_price = self.data.Close[-1] + 1.5 * self.atr[-1]
                    self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        exit_rules = self.spec.get("exit_rules")
        if exit_rules:
            stop_loss = exit_rules.get("stop_loss")
            take_profit = exit_rules.get("take_profit")
            time_stop = exit_rules.get("time_stop")
            if stop_loss and stop_loss["type"] == "atr":
                multiplier = stop_loss["params"]["multiplier"]
                if self.position.is_long:
                    self.sl_price = self.data.Close[-1] - multiplier * self.atr[-1]
                elif self.position.is_short:
                    self.sl_price = self.data.Close[-1] + multiplier * self.atr[-1]
            if take_profit and take_profit["type"] == "opposite_bb":
                if self.position.is_long:
                    self.tp_price = self.upper_bb[-1]
                elif self.position.is_short:
                    self.tp_price = self.lower_bb[-1]
            if time_stop and time_stop["type"] == "bars":
                num_bars = time_stop["params"]["num_bars"]
                trade = self.trades[-1] if self.trades else None
                if trade is not None:
                    bars_open = len(self.data) - trade.entry_bar
                    if bars_open >= num_bars:
                        self.position.close()