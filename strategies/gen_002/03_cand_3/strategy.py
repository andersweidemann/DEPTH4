import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    ema_trend_period = 200
    ema_fast_period = 50
    bb_period = 20
    bb_dev = 2.0
    rsi_period = 14
    atr_period = 14
    adx_period = 14
    adx_min = 18
    sl_atr_mult = 1.2
    tp_atr_cap = 3.0
    time_stop_bars = 24
    cooldown_bars = 3
    risk_pct = 0.5
    session_start_hour = 6
    session_end_hour = 21
    atr_pct_min = 0.3
    atr_pct_max = 0.9

    def init(self):
        try:
            spec_file = Path(__file__).parent / self.spec_path
            if spec_file.exists():
                self._spec = json.loads(spec_file.read_text())
        except Exception:
            pass
        super().init()

        close = self.data.Close

        self._ema_trend = self.I(signals.ema, close, self.ema_trend_period)
        self._ema_fast = self.I(signals.ema, close, self.ema_fast_period)

        def _bb_mid(c, n, d):
            mid, up, lo = signals.bollinger(pd.Series(c), n, d)
            return np.asarray(mid)

        def _bb_up(c, n, d):
            mid, up, lo = signals.bollinger(pd.Series(c), n, d)
            return np.asarray(up)

        def _bb_lo(c, n, d):
            mid, up, lo = signals.bollinger(pd.Series(c), n, d)
            return np.asarray(lo)

        self._bb_mid = self.I(_bb_mid, close, self.bb_period, self.bb_dev)
        self._bb_up = self.I(_bb_up, close, self.bb_period, self.bb_dev)
        self._bb_lo = self.I(_bb_lo, close, self.bb_period, self.bb_dev)

        self._rsi = self.I(signals.rsi, close, self.rsi_period)
        self._atr_series = self.I(signals.atr, self.data, self.atr_period)

        def _adx(data, n):
            return np.asarray(regime.adx(data.df if hasattr(data, "df") else data, n))

        self._adx_series = self.I(_adx, self.data, self.adx_period)

        def _atr_pct(data, n):
            return np.asarray(regime.atr_percentile(data.df if hasattr(data, "df") else data, n))

        try:
            self._atr_pct = self.I(_atr_pct, self.data, self.atr_period)
        except Exception:
            self._atr_pct = None

        self._last_entry_bar = -10_000

    def _session_ok(self) -> bool:
        ts = pd.Timestamp(self.data.index[-1])
        h = ts.hour
        return self.session_start_hour <= h < self.session_end_hour

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 1:
            return False
        adx_v = float(self._adx_series[-1])
        if np.isnan(adx_v) or adx_v < self.adx_min:
            return False
        if self._atr_pct is not None and len(self._atr_pct) > 0:
            ap = float(self._atr_pct[-1])
            if not np.isnan(ap):
                if ap < self.atr_pct_min or ap > self.atr_pct_max:
                    return False
        return True

    def _filters_ok(self) -> bool:
        if not self._session_ok():
            return False
        try:
            now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
            dd_kill = self.spec.get("risk", {}).get(
                "daily_dd_kill_pct",
                config.load()["risk"]["daily_dd_kill_pct"],
            )
            if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
                return False
        except Exception:
            pass
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self.cooldown_bars:
            return
        if len(self._ema_fast) < 6 or len(self._bb_mid) < 1:
            return

        close = float(self.data.Close[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])
        ema_t = float(self._ema_trend[-1])
        ema_f = float(self._ema_fast[-1])
        ema_f_prev = float(self._ema_fast[-6])
        adx_v = float(self._adx_series[-1])
        rsi_v = float(self._rsi[-1])
        atr_v = float(self._atr_series[-1])
        bb_mid = float(self._bb_mid[-1])
        bb_up = float(self._bb_up[-1])
        bb_lo = float(self._bb_lo[-1])

        if any(np.isnan(x) for x in [ema_t, ema_f, ema_f_prev, adx_v, rsi_v, atr_v, bb_mid, bb_up, bb_lo]):
            return

        if adx_v <= self.adx_min:
            return
        if not (40 <= rsi_v <= 60):
            return

        long_cond = (
            close > ema_t
            and ema_f > ema_f_prev
            and low <= bb_mid
            and close > bb_mid
        )
        short_cond = (
            close < ema_t
            and ema_f < ema_f_prev
            and high >= bb_mid
            and close < bb_mid
        )

        if not (long_cond or short_cond):
            return

        if long_cond:
            sl = close - self.sl_atr_mult * atr_v
            tp_dyn = bb_up
            tp_cap = close + self.tp_atr_cap * atr_v
            tp = min(tp_dyn, tp_cap)
            if sl >= close or tp <= close:
                return
        else:
            sl = close + self.sl_atr_mult * atr_v
            tp_dyn = bb_lo
            tp_cap = close - self.tp_atr_cap * atr_v
            tp = max(tp_dyn, tp_cap)
            if sl <= close or tp >= close:
                return

        stop_dist = abs(close - sl)
        if stop_dist <= 0:
            return

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                stop_distance=stop_dist,
                price=close,
                symbol=self._symbol,
            )
        except TypeError:
            try:
                size = risk.lots_by_risk_pct(self.equity, self.risk_pct, stop_dist, close)
            except Exception:
                size = 0.0
        except Exception:
            size = 0.0

        if size is None or size <= 0:
            frac = (self.risk_pct / 100.0) * self.equity / max(stop_dist, 1e-9) / max(close, 1e-9)
            frac = min(max(frac, 0.0), 0.99)
            if frac <= 0:
                return
            size = frac

        if isinstance(size, float) and 0 < size < 1:
            order_size = size
        else:
            order_size = max(1, int(size))

        self.sl_price = sl
        self.tp_price = tp

        try:
            if long_cond:
                self.buy(size=order_size, sl=sl, tp=tp)
            else:
                self.sell(size=order_size, sl=sl, tp=tp)
            self._last_entry_bar = bar_i
        except Exception:
            return

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return
        bar_i = len(self.data) - 1
        price = float(self.data.Close[-1])

        for trade in list(self.trades):
            bars_open = bar_i - trade.entry_bar
            if self.time_stop_bars is not None and bars_open >= self.time_stop_bars:
                try:
                    trade.close()
                except Exception:
                    self.position.close()
                continue

            entry = trade.entry_price
            if trade.sl is None:
                continue
            init_risk = abs(entry - trade.sl)
            if init_risk <= 0:
                continue

            if trade.is_long:
                if price - entry >= init_risk and (trade.sl is None or trade.sl < entry):
                    trade.sl = entry
            else:
                if entry - price >= init_risk and (trade.sl is None or trade.sl > entry):
                    trade.sl = entry

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()