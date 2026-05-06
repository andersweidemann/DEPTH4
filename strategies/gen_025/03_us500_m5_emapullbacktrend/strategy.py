from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _ema_arr(close, n):
    return signals.ema(close, n)


def _rsi_arr(close, n):
    return signals.rsi(close, n)


def _atr_arr(data, n):
    return signals.atr(data, n)


def _adx_arr(data, n):
    return regime.adx(data, n)


def _atrp_arr(data, n, lookback):
    return regime.atr_percentile(data, n, lookback)


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    _ATR_PERIOD = 14
    _ADX_PERIOD = 14
    _ATR_LOOKBACK = 200
    _EMA_FAST = 20
    _EMA_MID = 50
    _EMA_SLOW = 200
    _RSI_PERIOD = 14
    _SL_ATR = 1.3
    _TP_ATR = 2.6
    _BE_ATR = 1.0
    _TRAIL_ATR = 1.8
    _TIME_STOP = 30
    _RISK_PCT = 0.5
    _MAX_DAILY_TRADES = 3
    _PULLBACK_LOOKBACK = 3
    _ADX_MIN = 20.0
    _ATRP_MIN = 25.0
    _ATRP_MAX = 90.0
    _SESSION_START = "13:30"
    _SESSION_END = "20:00"

    def init(self):
        # Minimal spec so base class helpers work even when spec file absent.
        try:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            spec_file = os.path.join(base_dir, self.spec_path)
            if os.path.exists(spec_file):
                with open(spec_file, "r") as f:
                    self._spec = json.load(f)
        except Exception:
            pass

        self.spec = dict(self._spec) if self._spec else {}
        self.spec.setdefault("risk", {})
        self.spec.setdefault("exit", {})
        self.spec.setdefault("filters", {})

        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)

        close = self.data.Close

        self._ema_fast = self.I(_ema_arr, close, self._EMA_FAST)
        self._ema_mid = self.I(_ema_arr, close, self._EMA_MID)
        self._ema_slow = self.I(_ema_arr, close, self._EMA_SLOW)
        self._rsi = self.I(_rsi_arr, close, self._RSI_PERIOD)
        self._atr_series = self.I(_atr_arr, self.data, self._ATR_PERIOD)
        self._adx_series = self.I(_adx_arr, self.data, self._ADX_PERIOD)
        self._atrp_series = self.I(_atrp_arr, self.data, self._ATR_PERIOD, self._ATR_LOOKBACK)

        # Session mask
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        try:
            self._session_mask_full = np.asarray(
                signals.session_mask(
                    full_idx,
                    [{"start_utc": self._SESSION_START, "end_utc": self._SESSION_END}],
                ),
                dtype=bool,
            )
        except Exception:
            # Fallback: compute manually
            ts = pd.DatetimeIndex(full_idx)
            if ts.tz is None:
                ts = ts.tz_localize("UTC")
            else:
                ts = ts.tz_convert("UTC")
            minutes = ts.hour * 60 + ts.minute
            sh, sm = map(int, self._SESSION_START.split(":"))
            eh, em = map(int, self._SESSION_END.split(":"))
            s = sh * 60 + sm
            e = eh * 60 + em
            self._session_mask_full = (minutes >= s) & (minutes < e)

        self._broker_spread_points = 0
        self._last_trade_date: Optional[str] = None
        self._trades_today = 0
        self._be_moved: Dict[int, bool] = {}

    def _session_ok(self) -> bool:
        mask = self._session_mask_full
        bar_i = len(self.data) - 1
        if mask is None:
            return True
        if 0 <= bar_i < len(mask):
            return bool(mask[bar_i])
        return False

    def _regime_ok(self) -> bool:
        if len(self.data) < max(self._EMA_SLOW, self._ATR_LOOKBACK) + 2:
            return False
        adx_v = float(self._adx_series[-1])
        if np.isnan(adx_v) or adx_v < self._ADX_MIN:
            return False
        atrp = float(self._atrp_series[-1])
        if np.isnan(atrp):
            return False
        if atrp < self._ATRP_MIN or atrp > self._ATRP_MAX:
            return False
        return True

    def _filters_ok(self) -> bool:
        if not self._session_ok():
            return False
        idx = self.data.index
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if self._last_trade_date != now_date:
            self._last_trade_date = now_date
            self._trades_today = 0
        if self._trades_today >= self._MAX_DAILY_TRADES:
            return False
        return True

    def _pullback_touch_long(self) -> bool:
        n = min(self._PULLBACK_LOOKBACK, len(self.data))
        for i in range(1, n + 1):
            if self.data.Low[-i] <= self._ema_fast[-i]:
                return True
        return False

    def _pullback_touch_short(self) -> bool:
        n = min(self._PULLBACK_LOOKBACK, len(self.data))
        for i in range(1, n + 1):
            if self.data.High[-i] >= self._ema_fast[-i]:
                return True
        return False

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if len(self.data) < self._EMA_SLOW + 2:
            return

        ema_f = float(self._ema_fast[-1])
        ema_m = float(self._ema_mid[-1])
        ema_s = float(self._ema_slow[-1])
        rsi_now = float(self._rsi[-1])
        rsi_prev = float(self._rsi[-2])
        close = float(self.data.Close[-1])
        atr_now = float(self._atr_series[-1])

        if np.isnan(ema_f) or np.isnan(ema_m) or np.isnan(ema_s) or np.isnan(atr_now):
            return
        if atr_now <= 0:
            return

        long_trend = ema_f > ema_m > ema_s
        short_trend = ema_f < ema_m < ema_s

        long_signal = (
            long_trend
            and self._pullback_touch_long()
            and rsi_prev <= 50 < rsi_now
            and close > ema_f
        )
        short_signal = (
            short_trend
            and self._pullback_touch_short()
            and rsi_prev >= 50 > rsi_now
            and close < ema_f
        )

        if not (long_signal or short_signal):
            return

        if long_signal:
            sl = close - self._SL_ATR * atr_now
            tp = close + self._TP_ATR * atr_now
            if sl >= close:
                return
            risk_per_unit = close - sl
        else:
            sl = close + self._SL_ATR * atr_now
            tp = close - self._TP_ATR * atr_now
            if sl <= close:
                return
            risk_per_unit = sl - close

        if risk_per_unit <= 0:
            return

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._RISK_PCT,
                stop_distance=risk_per_unit,
                price=close,
                symbol=self._symbol,
            )
        except Exception:
            risk_cash = self.equity * (self._RISK_PCT / 100.0)
            size = risk_cash / risk_per_unit

        if size is None or size <= 0:
            return

        try:
            if isinstance(size, float) and size < 1:
                size = max(min(size, 0.99), 1e-4)
            else:
                size = max(int(size), 1)
        except Exception:
            return

        self.sl_price = sl
        self.tp_price = tp

        if long_signal:
            self.buy(size=size, sl=sl, tp=tp)
        else:
            self.sell(size=size, sl=sl, tp=tp)

        self._trades_today += 1

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return

        atr_now = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        price = float(self.data.Close[-1])

        for trade in list(self.trades):
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self._TIME_STOP:
                trade.close()
                continue

            if np.isnan(atr_now) or atr_now <= 0:
                continue

            entry = trade.entry_price
            tid = trade.entry_bar

            if trade.is_long:
                profit = price - entry
                if profit >= self._BE_ATR * atr_now and not self._be_moved.get(tid, False):
                    if trade.sl is None or trade.sl < entry:
                        trade.sl = entry
                    self._be_moved[tid] = True
                if profit >= self._BE_ATR * atr_now:
                    new_sl = price - self._TRAIL_ATR * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                profit = entry - price
                if profit >= self._BE_ATR * atr_now and not self._be_moved.get(tid, False):
                    if trade.sl is None or trade.sl > entry:
                        trade.sl = entry
                    self._be_moved[tid] = True
                if profit >= self._BE_ATR * atr_now:
                    new_sl = price + self._TRAIL_ATR * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl

    def next(self):
        if not self._regime_ok():
            self._manage_open()
            return
        if not self._filters_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()