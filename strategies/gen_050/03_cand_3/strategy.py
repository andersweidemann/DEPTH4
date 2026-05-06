import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, regime, risk, config


def _resample_ema(close_series: pd.Series, index: pd.DatetimeIndex, tf: str, period: int) -> np.ndarray:
    s = pd.Series(np.asarray(close_series, dtype=float), index=index)
    rule = {"H1": "1H", "H4": "4H", "D1": "1D", "M15": "15T", "M5": "5T"}.get(tf, tf)
    htf = s.resample(rule, label="right", closed="right").last().dropna()
    ema = htf.ewm(span=period, adjust=False).mean()
    reindexed = ema.reindex(index, method="ffill")
    return reindexed.to_numpy(dtype=float)


def _resample_close(close_series: pd.Series, index: pd.DatetimeIndex, tf: str) -> np.ndarray:
    s = pd.Series(np.asarray(close_series, dtype=float), index=index)
    rule = {"H1": "1H", "H4": "4H", "D1": "1D"}.get(tf, tf)
    htf = s.resample(rule, label="right", closed="right").last().dropna()
    reindexed = htf.reindex(index, method="ffill")
    return reindexed.to_numpy(dtype=float)


def _resample_ohlc_adx(df: pd.DataFrame, tf: str, period: int) -> np.ndarray:
    rule = {"H1": "1H", "H4": "4H", "D1": "1D"}.get(tf, tf)
    htf = pd.DataFrame({
        "High": df["High"].resample(rule, label="right", closed="right").max(),
        "Low": df["Low"].resample(rule, label="right", closed="right").min(),
        "Close": df["Close"].resample(rule, label="right", closed="right").last(),
    }).dropna()
    adx_vals = regime.adx(htf["High"].values, htf["Low"].values, htf["Close"].values, period)
    s = pd.Series(adx_vals, index=htf.index)
    return s.reindex(df.index, method="ffill").to_numpy(dtype=float)


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        try:
            with open(spec_file, "r") as f:
                self._spec = json.load(f)
        except Exception:
            self._spec = {}

        super().init()

        close = self.data.Close
        high = self.data.High
        low = self.data.Low

        self._ema20 = self.I(signals.ema, close, 20)
        self._rsi14 = self.I(signals.rsi, close, 14)
        self._atr_series = self.I(signals.atr, self.data, 14)

        df = self.data.df if hasattr(self.data, "df") else None
        if df is None:
            idx = self.data.index
            df = pd.DataFrame({
                "Open": np.asarray(self.data.Open),
                "High": np.asarray(high),
                "Low": np.asarray(low),
                "Close": np.asarray(close),
            }, index=pd.DatetimeIndex(idx))

        idx = df.index

        self._h1_ema50 = self.I(lambda: _resample_ema(df["Close"], idx, "H1", 50))
        self._h1_ema200 = self.I(lambda: _resample_ema(df["Close"], idx, "H1", 200))
        self._h1_close = self.I(lambda: _resample_close(df["Close"], idx, "H1"))
        self._h1_adx = self.I(lambda: _resample_ohlc_adx(df, "H1", 14))

        self._atr_pct = self.I(regime.atr_percentile, high, low, close, 14, 200)
        self._regime_series = self.I(regime.classify, high, low, close, 14, 14)

        sessions_cfg = [{"start": "13:30", "end": "20:00"}]
        self._session_mask_full = np.asarray(
            signals.session_mask(idx, sessions_cfg), dtype=bool
        )

        self._last_entry_bar = -10_000
        self._entries_today = 0
        self._current_day = None

    def _regime_ok(self) -> bool:
        adx_val = float(self._h1_adx[-1]) if len(self._h1_adx) else np.nan
        if np.isnan(adx_val) or adx_val < 18:
            return False
        atrp = float(self._atr_pct[-1]) if len(self._atr_pct) else np.nan
        if np.isnan(atrp) or atrp < 20 or atrp > 90:
            return False
        reg = self._regime_series[-1]
        try:
            reg_str = str(reg).lower()
        except Exception:
            reg_str = ""
        if not any(k in reg_str for k in ("trend",)):
            return False
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def _swing_low(self, n: int = 10) -> float:
        lows = np.asarray(self.data.Low)[-n:]
        return float(np.min(lows)) if len(lows) else float(self.data.Low[-1])

    def _swing_high(self, n: int = 10) -> float:
        highs = np.asarray(self.data.High)[-n:]
        return float(np.max(highs)) if len(highs) else float(self.data.High[-1])

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if len(self._rsi14) < 3 or len(self._ema20) < 2:
            return

        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < 8:
            return

        today = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        if today != self._current_day:
            self._current_day = today
            self._entries_today = 0
        if self._entries_today >= 2:
            return

        close = float(self.data.Close[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])
        ema20 = float(self._ema20[-1])
        rsi_now = float(self._rsi14[-1])
        rsi_prev = float(self._rsi14[-2])
        atr_now = float(self._atr_series[-1])
        h1_e50 = float(self._h1_ema50[-1])
        h1_e200 = float(self._h1_ema200[-1])
        h1_c = float(self._h1_close[-1])

        if any(np.isnan(x) for x in (ema20, rsi_now, rsi_prev, atr_now, h1_e50, h1_e200, h1_c)):
            return
        if atr_now <= 0:
            return

        equity = float(self.equity)
        risk_pct = float(self._spec.get("sizing", {}).get("risk_pct", 0.5))

        long_ok = (
            h1_e50 > h1_e200
            and h1_c > h1_e200
            and low <= ema20
            and close > ema20
            and 40.0 <= rsi_now <= 58.0
            and rsi_now > rsi_prev
        )

        short_ok = (
            h1_e50 < h1_e200
            and h1_c < h1_e200
            and high >= ema20
            and close < ema20
            and 42.0 <= rsi_now <= 60.0
            and rsi_now < rsi_prev
        )

        if long_ok:
            swing_lo = self._swing_low(10)
            sl = min(swing_lo, close) - 1.3 * atr_now
            if sl >= close:
                return
            tp = close + 2.0 * atr_now
            sl_points = close - sl
            if sl_points <= 0:
                return
            try:
                size = risk.lots_by_risk_pct(equity, risk_pct, sl_points, self._symbol)
            except Exception:
                size = 0.0
            if size is None or size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
                self._entries_today += 1
            except Exception:
                pass

        elif short_ok:
            swing_hi = self._swing_high(10)
            sl = max(swing_hi, close) + 1.3 * atr_now
            if sl <= close:
                return
            tp = close - 2.0 * atr_now
            sl_points = sl - close
            if sl_points <= 0:
                return
            try:
                size = risk.lots_by_risk_pct(equity, risk_pct, sl_points, self._symbol)
            except Exception:
                size = 0.0
            if size is None or size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
                self._entries_today += 1
            except Exception:
                pass

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return

        time_stop = 24
        atr_now = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        price = float(self.data.Close[-1])

        for trade in list(self.trades):
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                trade.close()
                continue

            if np.isnan(atr_now) or atr_now <= 0:
                continue

            entry = trade.entry_price
            if trade.is_long:
                init_risk = entry - (trade.sl if trade.sl is not None else entry - 1.3 * atr_now)
                if init_risk <= 0:
                    continue
                r_mult = (price - entry) / init_risk
                if r_mult >= 1.0:
                    if trade.sl is None or trade.sl < entry:
                        trade.sl = entry
                if r_mult >= 1.2:
                    highest = float(np.max(np.asarray(self.data.High)[trade.entry_bar:]))
                    new_sl = highest - 2.0 * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                init_risk = (trade.sl if trade.sl is not None else entry + 1.3 * atr_now) - entry
                if init_risk <= 0:
                    continue
                r_mult = (entry - price) / init_risk
                if r_mult >= 1.0:
                    if trade.sl is None or trade.sl > entry:
                        trade.sl = entry
                if r_mult >= 1.2:
                    lowest = float(np.min(np.asarray(self.data.Low)[trade.entry_bar:]))
                    new_sl = lowest + 2.0 * atr_now
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