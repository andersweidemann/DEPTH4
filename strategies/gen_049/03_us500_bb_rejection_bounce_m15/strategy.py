import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _bb_upper(data, period=20, dev=2.0):
    mid, upper, lower = signals.bollinger(data, period, dev)
    return upper


def _bb_lower(data, period=20, dev=2.0):
    mid, upper, lower = signals.bollinger(data, period, dev)
    return lower


def _bb_mid(data, period=20, dev=2.0):
    mid, upper, lower = signals.bollinger(data, period, dev)
    return mid


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        try:
            with open(spec_file) as f:
                self._spec = json.load(f)
        except Exception:
            if not self._spec:
                self._spec = {}
        super().init()

        self._bb_upper = self.I(_bb_upper, self.data, 20, 2.0)
        self._bb_lower = self.I(_bb_lower, self.data, 20, 2.0)
        self._bb_mid = self.I(_bb_mid, self.data, 20, 2.0)
        self._bb_width = self.I(signals.bb_width, self.data, 20, 2.0)
        self._rsi = self.I(signals.rsi, self.data, 14)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)

        self._bars_since_entry = 10_000
        self._last_trade_day = None
        self._trades_today = 0

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val >= 25:
            return False

        width_arr = np.asarray(self._bb_width)
        lookback = 400
        if len(width_arr) < 50:
            return False
        start = max(0, len(width_arr) - lookback)
        recent = width_arr[start:]
        recent = recent[~np.isnan(recent)]
        if len(recent) < 20:
            return False
        cur = float(self._bb_width[-1])
        if np.isnan(cur):
            return False
        pct = (recent < cur).sum() / len(recent) * 100.0
        if pct < 50:
            return False

        ts = pd.Timestamp(self.data.index[-1])
        if ts.tzinfo is None:
            ts = ts.tz_localize("UTC")
        else:
            ts = ts.tz_convert("UTC")
        minutes = ts.hour * 60 + ts.minute
        if not (13 * 60 + 30 <= minutes <= 20 * 60):
            return False

        return True

    def _filters_ok(self) -> bool:
        now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        if not risk.daily_kill_ok(
            self._kill_state, now_date, self.equity,
            self.spec.get("risk", {}).get(
                "daily_dd_kill_pct",
                config.load()["risk"]["daily_dd_kill_pct"])):
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if len(self.data) < 25:
            return

        now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        if self._last_trade_day != now_date:
            self._last_trade_day = now_date
            self._trades_today = 0
        if self._trades_today >= 3:
            return
        if self._bars_since_entry < 8:
            return

        close = float(self.data.Close[-1])
        close1 = float(self.data.Close[-2])
        close2 = float(self.data.Close[-3])
        low1 = float(self.data.Low[-2])
        high1 = float(self.data.High[-2])

        bbl = float(self._bb_lower[-1])
        bbl2 = float(self._bb_lower[-3])
        bbl1 = float(self._bb_lower[-2])
        bbu = float(self._bb_upper[-1])
        bbu2 = float(self._bb_upper[-3])
        bbu1 = float(self._bb_upper[-2])
        bbm = float(self._bb_mid[-1])
        rsi_v = float(self._rsi[-1])
        atr_v = float(self._atr_series[-1])

        if any(np.isnan(x) for x in [bbl, bbl2, bbl1, bbu, bbu2, bbu1, bbm, rsi_v, atr_v]):
            return

        risk_pct = self.spec.get("sizing", {}).get("risk_pct", 0.5)

        long_sig = (close2 > bbl2 and low1 <= bbl1 and close > bbl and
                    close > close1 and rsi_v < 45)
        short_sig = (close2 < bbu2 and high1 >= bbu1 and close < bbu and
                     close < close1 and rsi_v > 55)

        if long_sig:
            sl = close - 1.5 * atr_v
            tp = bbm
            rr = (tp - close) / (close - sl) if (close - sl) > 0 else 0
            if rr < 2.0:
                tp = close + 3.0 * atr_v
            size = risk.lots_by_risk_pct(
                equity=self.equity, risk_pct=risk_pct,
                entry=close, stop=sl, symbol=self._symbol)
            if size and size > 0:
                self.sl_price = sl
                self.tp_price = tp
                try:
                    self.buy(size=size, sl=sl, tp=tp)
                    self._bars_since_entry = 0
                    self._trades_today += 1
                except Exception:
                    pass
        elif short_sig:
            sl = close + 1.5 * atr_v
            tp = bbm
            rr = (close - tp) / (sl - close) if (sl - close) > 0 else 0
            if rr < 2.0:
                tp = close - 3.0 * atr_v
            size = risk.lots_by_risk_pct(
                equity=self.equity, risk_pct=risk_pct,
                entry=close, stop=sl, symbol=self._symbol)
            if size and size > 0:
                self.sl_price = sl
                self.tp_price = tp
                try:
                    self.sell(size=size, sl=sl, tp=tp)
                    self._bars_since_entry = 0
                    self._trades_today += 1
                except Exception:
                    pass

    def _manage_open(self) -> None:
        if self.position and self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= 20:
                self.position.close()
                return

    def next(self):
        self._bars_since_entry += 1
        if not self._regime_ok():
            self._manage_open()
            return
        if not self._filters_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()