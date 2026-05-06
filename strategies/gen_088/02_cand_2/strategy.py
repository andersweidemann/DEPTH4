import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    _spec = {
        "hypothesis": "Price touching the Bollinger Band with an RSI extreme reading leads to a mean reversion opportunity, which can be traded with a trailing stop loss.",
        "regime_filter": "bb_width > 20th percentile",
        "entry_rule": "Close > Upper BB(20, 2.0) AND RSI(7) > 80 OR Close < Lower BB(20, 2.0) AND RSI(7) < 20",
        "exit_rule": {
            "sl": "trailing stop loss of 100 pips",
            "tp": "500 pips",
            "time_stop": "20 bars"
        },
        "sizing_rule": "fixed fraction of equity",
        "symbol": "BTCUSD",
        "timeframe": "M5"
    }
    _symbol = "BTCUSD"
    _equity_start = 10000.0

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger = self.I(bollinger, self.data, n=20, std_dev=2.0)
        self.rsi = self.I(rsi, self.data, n=7)
        self.bb_width = self.I(bb_width, self.data, n=20, std_dev=2.0)
        self.atr = self.I(atr, self.data, n=20)

    def _regime_ok(self):
        bb_width_val = float(self.bb_width[-1])
        percentile = np.percentile(self.bb_width, 20)
        return bb_width_val > percentile

    def _enter_if_signal(self):
        close = float(self.data.Close[-1])
        upper_bb = float(self.bollinger['upper'][-1])
        lower_bb = float(self.bollinger['lower'][-1])
        rsi_val = float(self.rsi[-1])
        if (close > upper_bb and rsi_val > 80) or (close < lower_bb and rsi_val < 20):
            lots = lots_by_risk_pct(self.spec, self._equity_start, self.data)
            self.position.enter(lots)
            self.sl_price = close - 100 * self.data._pip if close > upper_bb else close + 100 * self.data._pip
            self.tp_price = close + 500 * self.data._pip if close > upper_bb else close - 500 * self.data._pip

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop", 20)
        if not self.position:
            return
        bars_open = len(self.data) - self.position.entry_bar
        if bars_open >= time_stop:
            self.position.close()
            return
        trail_mult = exit_cfg.get("trail_atr_mult", 1.0)
        atr_now = float(self.atr[-1])
        price = float(self.data.Close[-1])
        if trail_mult and not np.isnan(atr_now):
            if self.position.is_long and self.position.pl_pct > 0:
                new_sl = price - trail_mult * atr_now
                if self.position.sl is None or new_sl > self.position.sl:
                    self.position.sl = new_sl
            elif not self.position.is_long and self.position.pl_pct > 0:
                new_sl = price + trail_mult * atr_now
                if self.position.sl is None or new_sl < self.position.sl:
                    self.position.sl = new_sl