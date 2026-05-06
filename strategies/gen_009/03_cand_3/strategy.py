import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _bb_upper(data, n, k):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    mid, upper, lower = signals.bollinger(close, n, k)
    return np.asarray(upper, dtype=float)


def _bb_lower(data, n, k):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    mid, upper, lower = signals.bollinger(close, n, k)
    return np.asarray(lower, dtype=float)


def _bb_mid(data, n, k):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    mid, upper, lower = signals.bollinger(close, n, k)
    return np.asarray(mid, dtype=float)


def _bb_width_arr(data, n, k):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    w = signals.bb_width(close, n, k)
    return np.asarray(w, dtype=float)


def _atr_pct_arr(data, n, lookback):
    ap = regime.atr_percentile(data.df if hasattr(data, "df") else None, n=n, lookback=lookback) \
        if False else None
    high = pd.Series(np.asarray(data.High, dtype=float))
    low = pd.Series(np.asarray(data.Low, dtype=float))
    close = pd.Series(np.asarray(data.Close, dtype=float))
    df = pd.DataFrame({"High": high, "Low": low, "Close": close})
    ap = regime.atr_percentile(df, n=n, lookback=lookback)
    return np.asarray(ap, dtype=float)


def _adx_arr(data, n):
    high = pd.Series(np.asarray(data.High, dtype=float))
    low = pd.Series(np.asarray(data.Low, dtype=float))
    close = pd.Series(np.asarray(data.Close, dtype=float))
    df = pd.DataFrame({"High": high, "Low": low, "Close": close})
    a = regime.adx(df, n=n)
    return np.asarray(a, dtype=float)


def _bbw_pct_arr(data, n, k, lookback):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    w = signals.bb_width(close, n, k)
    w = pd.Series(np.asarray(w, dtype=float))
    pct = w.rolling(lookback, min_periods=max(20, lookback // 4)).rank(pct=True)
    return np.asarray(pct, dtype=float)


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    BB_N = 20
    BB_K = 2.0
    ATR_N = 14
    ADX_N = 14
    ATR_PCT_LB = 300
    BBW_PCT_LB = 200
    COOLDOWN = 8
    TIME_STOP = 30
    SL_MULT = 1.2
    TP_MULT = 2.0
    TRAIL_MULT = 1.8

    def init(self):
        try:
            p = Path(__file__).parent / self.spec_path
            if p.exists():
                self._spec = json.loads(p.read_text())
        except Exception:
            pass
        super().init()

        self._upper = self.I(_bb_upper, self.data, self.BB_N, self.BB_K)
        self._lower = self.I(_bb_lower, self.data, self.BB_N, self.BB_K)
        self._mid = self.I(_bb_mid, self.data, self.BB_N, self.BB_K)
        self._bbw = self.I(_bb_width_arr, self.data, self.BB_N, self.BB_K)
        self._bbw_pct = self.I(_bbw_pct_arr, self.data, self.BB_N, self.BB_K, self.BBW_PCT_LB)

        self._atr_series = self.I(signals.atr, self.data, self.ATR_N)
        self._atr_pct = self.I(_atr_pct_arr, self.data, self.ATR_N, self.ATR_PCT_LB)
        self._adx_series = self.I(_adx_arr, self.data, self.ADX_N)

        self._last_entry_bar = -10_000

        sess = [("07:00", "21:00")]
        try:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(signals.session_mask(full_idx, sess), dtype=bool)
        except Exception:
            self._session_mask_full = None

    def _in_session(self) -> bool:
        mask = getattr(self, "_session_mask_full", None)
        if mask is None:
            return True
        i = len(self.data) - 1
        if 0 <= i < len(mask):
            return bool(mask[i])
        return True

    def _regime_ok_custom(self) -> bool:
        if len(self._atr_pct) < 2 or len(self._adx_series) < 2:
            return False
        ap_now = float(self._atr_pct[-1])
        ap_prev = float(self._atr_pct[-5]) if len(self._atr_pct) >= 5 else float(self._atr_pct[0])
        adx_now = float(self._adx_series[-1])
        if np.isnan(ap_now) or np.isnan(adx_now):
            return False
        if ap_now <= 0.30:
            return False
        if not np.isnan(ap_prev) and ap_now < ap_prev:
            return False
        if adx_now <= 15:
            return False
        return True

    def next(self):
        if not self._in_session():
            self._manage_open_custom()
            return
        if not self._regime_ok_custom():
            self._manage_open_custom()
            return
        self._enter_if_signal()
        self._manage_open_custom()

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self.COOLDOWN:
            return
        if bar_i < max(self.BB_N + 6, self.BBW_PCT_LB + 6):
            return

        bbw_pct_5ago = float(self._bbw_pct[-6]) if len(self._bbw_pct) > 6 else np.nan
        if np.isnan(bbw_pct_5ago) or bbw_pct_5ago >= 0.20:
            return

        close = float(self.data.Close[-1])
        close_5 = float(self.data.Close[-6])
        upper = float(self._upper[-1])
        lower = float(self._lower[-1])
        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return

        long_sig = (close > upper) and (close > close_5)
        short_sig = (close < lower) and (close < close_5)

        if not (long_sig or short_sig):
            return

        equity = float(self.equity)
        risk_pct = float(self.spec.get("sizing", {}).get("risk_pct_per_trade", 0.4))

        if long_sig:
            sl = close - self.SL_MULT * atr_now
            tp = close + self.TP_MULT * atr_now
            if sl >= close:
                return
            stop_dist = close - sl
            try:
                size = risk.lots_by_risk_pct(equity, risk_pct, stop_dist, self._symbol)
            except Exception:
                size = None
            if size is None or size <= 0:
                size = 0.02
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self.sl_price = sl
                self.tp_price = tp
                self._last_entry_bar = bar_i
            except Exception:
                pass
        else:
            sl = close + self.SL_MULT * atr_now
            tp = close - self.TP_MULT * atr_now
            if sl <= close:
                return
            stop_dist = sl - close
            try:
                size = risk.lots_by_risk_pct(equity, risk_pct, stop_dist, self._symbol)
            except Exception:
                size = None
            if size is None or size <= 0:
                size = 0.02
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self.sl_price = sl
                self.tp_price = tp
                self._last_entry_bar = bar_i
            except Exception:
                pass

    def _manage_open_custom(self) -> None:
        if not self.position or not self.trades:
            return
        atr_now = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        price = float(self.data.Close[-1])
        bar_i = len(self.data) - 1

        for trade in list(self.trades):
            bars_open = bar_i - trade.entry_bar
            if bars_open >= self.TIME_STOP:
                try:
                    trade.close()
                except Exception:
                    pass
                continue

            if np.isnan(atr_now) or atr_now <= 0:
                continue

            entry = float(trade.entry_price)
            if trade.is_long:
                r = entry - (trade.sl if trade.sl is not None else entry - self.SL_MULT * atr_now)
                if r <= 0:
                    continue
                if price - entry >= r:
                    new_sl = price - self.TRAIL_MULT * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        try:
                            trade.sl = new_sl
                        except Exception:
                            pass
            else:
                r = (trade.sl if trade.sl is not None else entry + self.SL_MULT * atr_now) - entry
                if r <= 0:
                    continue
                if entry - price >= r:
                    new_sl = price + self.TRAIL_MULT * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        try:
                            trade.sl = new_sl
                        except Exception:
                            pass