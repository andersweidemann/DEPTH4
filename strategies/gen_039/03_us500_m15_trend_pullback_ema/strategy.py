from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _rth_session_mask(index) -> np.ndarray:
    idx = pd.DatetimeIndex(index)
    if idx.tz is None:
        idx_utc = idx.tz_localize("UTC")
    else:
        idx_utc = idx.tz_convert("UTC")
    minutes = idx_utc.hour * 60 + idx_utc.minute
    return (minutes >= 13 * 60 + 30) & (minutes < 20 * 60)


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        try:
            super().init()
        except Exception:
            self.spec = dict(self._spec) if self._spec else {}
            try:
                self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
            except Exception:
                self._kill_state = None
            self._session_mask_full = None
            self._broker_spread_points = 0

        self._ema20 = self.I(signals.ema, self.data.Close, 20)
        self._ema50 = self.I(signals.ema, self.data.Close, 50)
        self._rsi14 = self.I(signals.rsi, self.data.Close, 14)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct = self.I(regime.atr_percentile, self.data, 14, 500)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._rth_mask = _rth_session_mask(idx)

        self._bars_received = 0
        self._indicator_ready_bar = -1
        self._signal_true_count = 0
        self._order_attempt_count = 0
        self._order_reject_reasons: Dict[str, int] = {}

    def _reject(self, reason: str) -> None:
        self._order_reject_reasons[reason] = self._order_reject_reasons.get(reason, 0) + 1

    def _regime_ok_local(self) -> bool:
        adx_val = float(self._adx_series[-1]) if len(self._adx_series) else np.nan
        atrp = float(self._atr_pct[-1]) if len(self._atr_pct) else np.nan
        if np.isnan(adx_val) or np.isnan(atrp):
            return False
        if adx_val <= 20:
            return False
        if atrp < 30:
            return False
        return True

    def _session_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if 0 <= bar_i < len(self._rth_mask):
            return bool(self._rth_mask[bar_i])
        return False

    def _daily_kill_ok(self) -> bool:
        if self._kill_state is None:
            return True
        try:
            now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
            dd_pct = self.spec.get("risk", {}).get(
                "daily_dd_kill_pct",
                config.load()["risk"]["daily_dd_kill_pct"],
            )
            return risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_pct)
        except Exception:
            return True

    def next(self):
        self._bars_received += 1

        ema20 = float(self._ema20[-1])
        ema50 = float(self._ema50[-1])
        rsi = float(self._rsi14[-1])
        atr = float(self._atr_series[-1])
        adx_val = float(self._adx_series[-1])

        if any(np.isnan(v) for v in (ema20, ema50, rsi, atr, adx_val)):
            return
        if self._indicator_ready_bar < 0:
            self._indicator_ready_bar = len(self.data) - 1

        self._manage_open_local()

        if self.position:
            return

        if not self._session_ok():
            return
        if not self._regime_ok_local():
            return
        if not self._daily_kill_ok():
            return

        price = float(self.data.Close[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])

        long_sig = (
            ema20 > ema50
            and adx_val > 20
            and low <= ema20
            and price > ema20
            and 40 <= rsi <= 65
        )
        short_sig = (
            ema20 < ema50
            and adx_val > 20
            and high >= ema20
            and price < ema20
            and 35 <= rsi <= 60
        )

        if not (long_sig or short_sig):
            return

        self._signal_true_count += 1

        sl_dist = 1.5 * atr
        tp_dist = 2.5 * atr
        if sl_dist <= 0:
            self._reject("invalid_sl_dist")
            return

        risk_pct = float(self.spec.get("sizing", {}).get("risk_per_trade_pct", 0.5))

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=risk_pct,
                sl_points=sl_dist,
                price=price,
                symbol=self._symbol,
            )
        except Exception:
            size = (self.equity * (risk_pct / 100.0)) / sl_dist if sl_dist > 0 else 0

        try:
            size_val = float(size)
        except Exception:
            size_val = 0.0

        if size_val <= 0:
            self._reject("size_zero")
            return

        if isinstance(size, float) and 0 < size < 1:
            order_size = size
        else:
            order_size = max(1, int(size_val))

        self._order_attempt_count += 1

        if long_sig:
            sl = price - sl_dist
            tp = price + tp_dist
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=order_size, sl=sl, tp=tp)
            except Exception as e:
                self._reject(f"buy_error:{type(e).__name__}")
        elif short_sig:
            sl = price + sl_dist
            tp = price - tp_dist
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=order_size, sl=sl, tp=tp)
            except Exception as e:
                self._reject(f"sell_error:{type(e).__name__}")

    def _manage_open_local(self):
        if not self.position or not self.trades:
            return

        trade = self.trades[-1]
        bars_open = len(self.data) - 1 - trade.entry_bar
        if bars_open >= 20:
            self.position.close()
            return

        bar_i = len(self.data) - 1
        if 0 <= bar_i < len(self._rth_mask):
            in_rth = bool(self._rth_mask[bar_i])
            next_i = bar_i + 1
            next_in_rth = bool(self._rth_mask[next_i]) if next_i < len(self._rth_mask) else False
            if in_rth and not next_in_rth:
                self.position.close()
                return