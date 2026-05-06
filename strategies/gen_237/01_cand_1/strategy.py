from agents.backtester import RegimeStrategy
from agents.signals import atr, donchian, session_mask
from agents.regime import adx, classify
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._atr_series = self.I(atr, self.data, self.spec["entry_rule"]["params"]["atr_period"])
        self._donchian_series = self.I(donchian, self.data, self.spec["entry_rule"]["params"]["atr_period"])
        self._session_mask_full = np.asarray(session_mask(self.data.index, [{"start_hour": 7, "end_hour": 10}]), dtype=bool)
        self._broker_spread_points = 0

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "london_session":
            start_hour = rf["params"]["start_hour"]
            end_hour = rf["params"]["end_hour"]
            current_hour = self.data.index[-1].hour
            return start_hour <= current_hour < end_hour
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
        entry_rule = self.spec["entry_rule"]
        if entry_rule["type"] == "breakout":
            atr_period = entry_rule["params"]["atr_period"]
            atr_multiplier = entry_rule["params"]["atr_multiplier"]
            atr_now = float(self._atr_series[-1])
            if not np.isnan(atr_now):
                high = float(self.data.High[-1])
                low = float(self.data.Low[-1])
                if high > self._donchian_series[-1] + atr_multiplier * atr_now:
                    self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["size"], self.equity, self.data))
                    self.sl_price = low - atr_multiplier * atr_now
                    self.tp_price = high + self.spec["exit_rule"]["params"]["tp_pips"] / 10000
                elif low < self._donchian_series[-1] - atr_multiplier * atr_now:
                    self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["size"], self.equity, self.data))
                    self.sl_price = high + atr_multiplier * atr_now
                    self.tp_price = low - self.spec["exit_rule"]["params"]["tp_pips"] / 10000

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        trail_mult = exit_cfg.get("trail_atr_mult")
        if trail_mult and hasattr(self, "_atr_series") and self.trades:
            atr_now = float(self._atr_series[-1])
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