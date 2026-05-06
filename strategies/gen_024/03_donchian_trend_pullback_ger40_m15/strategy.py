from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    donchian_n: int = 40
    breakout_lookback: int = 20
    ema_fast: int = 20
    ema_slow: int = 50
    atr_n: int = 14
    rsi_n: int = 14
    adx_n: int = 14
    atr_pct_n: int = 14
    atr_pct_lb: int = 200

    adx_min: float = 22.0
    atr_pct_min: float = 0.35
    atr_pct_max: float = 0.95

    rsi_low: float = 40.0
    rsi_high: float = 60.0

    pullback_atr_mult: float = 0.3
    sl_atr_min_mult: float = 1.0
    tp_r_mult: float = 2.5
    be_r_mult: float = 1.0
    trail_trigger_r: float = 1.5
    trail_atr_mult: float = 2.0

    swing_bars: int = 5
    time_stop_bars: int = 30
    min_bars_since_breakout: int = 2

    risk_pct: float = 0.6
    session_start_min: int = 7 * 60
    session_end_min: int = 15 * 60 + 30
    hard_close_min: int = 20 * 60

    def init(self):
        try:
            p = Path(__file__).parent / self.spec_path
            if p.exists():
                self._spec = json.loads(p.read_text())
        except Exception:
            pass
        super().init()

        self._ema_fast = self.I(signals.ema, self.data.Close, self.ema_fast)
        self._ema_slow = self.I(signals.ema, self.data.Close, self.ema_slow)
        self._atr_series = self.I(signals.atr, self.data, self.atr_n)
        self._rsi_series = self.I(signals.rsi, self.data.Close, self.rsi_n)

        dc = self.I(signals.donchian, self.data, self.donchian_n)
        self._dc_upper = dc[0]
        self._dc_lower = dc[1]

        self._adx_series = self.I(regime.adx, self.data, self.adx_n)
        self._atr_pct_series = self.I(
            regime.atr_percentile, self.data, self.atr_pct_n, self.atr_pct_lb
        )
        self._regime_series = self.I(
            regime.classify, self.data, self.adx_n, self.atr_pct_n, self.atr_pct_lb
        )

    def _regime_ok(self) -> bool:
        if len(self.data) < max(self.atr_pct_lb, self.donchian_n) + 5:
            return False
        adx_v = float(self._adx_series[-1])
        if np.isnan(adx_v) or adx_v < self.adx_min:
            return False
        atrp = float(self._atr_pct_series[-1])
        if np.isnan(atrp) or atrp < self.atr_pct_min or atrp > self.atr_pct_max:
            return False
        reg = self._regime_series[-1]
        try:
            reg_s = str(reg).upper()
        except Exception:
            reg_s = ""
        if "TREND" not in reg_s:
            return False
        return True

    def _in_session(self, ts: pd.Timestamp) -> bool:
        m = ts.hour * 60 + ts.minute
        return self.session_start_min <= m <= self.session_end_min

    def _filters_ok(self) -> bool:
        idx = self.data.index
        ts = pd.Timestamp(idx[-1])
        if not self._in_session(ts):
            return False
        now_date = ts.strftime("%Y-%m-%d")
        try:
            ddk = self.spec.get("risk", {}).get(
                "daily_dd_kill_pct",
                config.load()["risk"]["daily_dd_kill_pct"],
            )
        except Exception:
            ddk = 0.05
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, ddk):
            return False
        return True

    def _bars_since_breakout_up(self) -> int:
        high = np.asarray(self.data.High)
        upper = np.asarray(self._dc_upper)
        n = len(high)
        lookback = min(self.breakout_lookback, n - 1)
        for k in range(1, lookback + 1):
            i = n - k
            if i - 1 >= 0 and high[i] >= upper[i - 1] - 1e-12:
                return k - 1
        return 10**6

    def _bars_since_breakout_dn(self) -> int:
        low = np.asarray(self.data.Low)
        lower = np.asarray(self._dc_lower)
        n = len(low)
        lookback = min(self.breakout_lookback, n - 1)
        for k in range(1, lookback + 1):
            i = n - k
            if i - 1 >= 0 and low[i] <= lower[i - 1] + 1e-12:
                return k - 1
        return 10**6

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        prior_high = float(self.data.High[-2])
        prior_low = float(self.data.Low[-2])
        ema_f = float(self._ema_fast[-1])
        ema_s = float(self._ema_slow[-1])
        atr_v = float(self._atr_series[-1])
        rsi_v = float(self._rsi_series[-1])

        if np.isnan(atr_v) or atr_v <= 0 or np.isnan(ema_f) or np.isnan(ema_s):
            return
        if np.isnan(rsi_v):
            return

        pullback_tol = self.pullback_atr_mult * atr_v

        lows = np.asarray(self.data.Low)[-self.swing_bars:]
        highs = np.asarray(self.data.High)[-self.swing_bars:]

        bs_up = self._bars_since_breakout_up()
        bs_dn = self._bars_since_breakout_dn()

        trend_up = bs_up <= self.breakout_lookback and ema_f > ema_s
        trend_dn = bs_dn <= self.breakout_lookback and ema_f < ema_s

        long_ok = (
            trend_up
            and bs_up >= self.min_bars_since_breakout
            and abs(close - ema_f) <= pullback_tol
            and self.rsi_low <= rsi_v <= self.rsi_high
            and close > open_
            and close > prior_high
        )

        short_ok = (
            trend_dn
            and bs_dn >= self.min_bars_since_breakout
            and abs(close - ema_f) <= pullback_tol
            and self.rsi_low <= rsi_v <= self.rsi_high
            and close < open_
            and close < prior_low
        )

        if not (long_ok or short_ok):
            return

        entry = close
        if long_ok:
            swing = float(np.min(lows))
            sl = min(swing, entry - self.sl_atr_min_mult * atr_v)
            if sl >= entry:
                return
            r = entry - sl
            tp = entry + self.tp_r_mult * r
            size = self._size(entry, sl)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.buy(size=size, sl=sl, tp=tp)
        else:
            swing = float(np.max(highs))
            sl = max(swing, entry + self.sl_atr_min_mult * atr_v)
            if sl <= entry:
                return
            r = sl - entry
            tp = entry - self.tp_r_mult * r
            size = self._size(entry, sl)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.sell(size=size, sl=sl, tp=tp)

    def _size(self, entry: float, sl: float) -> float:
        try:
            lots = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                entry=entry,
                sl=sl,
                symbol=self._symbol,
            )
        except TypeError:
            try:
                lots = risk.lots_by_risk_pct(
                    self.equity, self.risk_pct, entry, sl, self._symbol
                )
            except Exception:
                lots = 0.0
        except Exception:
            lots = 0.0
        try:
            lots = float(lots)
        except Exception:
            lots = 0.0
        if lots <= 0 or np.isnan(lots):
            risk_cash = self.equity * (self.risk_pct / 100.0)
            per_unit = abs(entry - sl)
            if per_unit <= 0:
                return 0.0
            units = risk_cash / per_unit
            frac = units / max(self.equity, 1.0)
            frac = max(0.0, min(frac, 0.95))
            return frac if frac > 0 else 0.0
        if lots >= 1:
            return max(1, int(lots))
        return max(0.0, min(lots, 0.95))

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return

        ts = pd.Timestamp(self.data.index[-1])
        minute_of_day = ts.hour * 60 + ts.minute
        if minute_of_day >= self.hard_close_min:
            self.position.close()
            return

        atr_v = float(self._atr_series[-1]) if not np.isnan(self._atr_series[-1]) else None
        price = float(self.data.Close[-1])

        for trade in list(self.trades):
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self.time_stop_bars:
                trade.close()
                continue

            entry = float(trade.entry_price)
            sl = trade.sl
            if sl is None:
                continue
            r = abs(entry - sl)
            if r <= 0:
                continue

            if trade.is_long:
                profit = price - entry
                if profit >= self.be_r_mult * r and (trade.sl is None or trade.sl < entry):
                    trade.sl = entry
                if atr_v is not None and profit >= self.trail_trigger_r * r:
                    new_sl = price - self.trail_atr_mult * atr_v
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                profit = entry - price
                if profit >= self.be_r_mult * r and (trade.sl is None or trade.sl > entry):
                    trade.sl = entry
                if atr_v is not None and profit >= self.trail_trigger_r * r:
                    new_sl = price + self.trail_atr_mult * atr_v
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl

    def next(self):
        self._manage_open()
        self._enter_if_signal()