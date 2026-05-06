from agents.backtester import RegimeStrategy
from agents.signals import donchian, atr
from agents.risk import lots_by_risk_pct, DailyKillState, daily_kill_ok, spread_ok

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.donchian_channel = self.I(donchian, self.data, self.spec["regime_filter"]["params"]["width_threshold"])
        self.channel_period = self.spec["entry_rule"]["params"]["channel_period"]
        self.upper_channel = self.I(donchian, self.data, self.channel_period, "high")
        self.lower_channel = self.I(donchian, self.data, self.channel_period, "low")
        self.atr = self.I(atr, self.data, 14)
        self.exit_params = self.spec["exit_rule"]["params"]
        self.sizing_params = self.spec["sizing_rule"]["params"]

    def _regime_ok(self):
        width = self.donchian_channel[-1]
        return width < self.spec["regime_filter"]["params"]["width_threshold"]

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        high = self.data.High[-1]
        low = self.data.Low[-1]
        upper = self.upper_channel[-1]
        lower = self.lower_channel[-1]
        if high >= upper or low <= lower:
            size = lots_by_risk_pct(self._equity_start, self.sizing_params["fraction"], self.atr[-1])
            self.position.enter(size)
            self.sl_price = self.data.Close[-1] - self.exit_params["sl"] * self._point
            self.tp_price = self.data.Close[-1] + self.exit_params["tp"] * self._point

    def _manage_open(self):
        if not self.position:
            return
        time_stop = self.exit_params["time_stop"]
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return