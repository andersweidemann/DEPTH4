import json
import os
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        super().init()
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                with open(spec_file, "r") as f:
                    extra = json.load(f)
                    merged = dict(self.spec)
                    merged.update(extra)
                    self.spec = merged
            except Exception:
                pass

        self._bb_upper = self.I(lambda d: signals.bollinger(d, 20, 2.0)[0], self.data)
        self._bb_middle = self.I(lambda d: signals.bollinger(d, 20, 2.0)[1], self.data)
        self._bb_lower = self.I(lambda d: signals.bollinger(d, 20, 2.0)[2], self.data)

        self._bb_width_series = self.I(signals.bb_width, self.data, 20, 2.0)
        self._rsi_series = self.I(signals.rsi, self.data, 7)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct_series = self.I(regime.atr_percentile, self.data, 14, 100)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        sessions = [{"start": "13:30", "end": "20:00"}]
        self._session_mask_full = np.asarray(
            signals.session_mask(idx, sessions), dtype=bool
        )

        self._last_trade_bar = -10_000
        self._cooldown = 3

    def _bb_width_percentile(self) -> float:
        lookback = 200
        if len(self._bb_width_series) < lookback + 1:
            return np.nan
        window = np.asarray(self._bb_width_series)[-lookback:]
        current = float(self._bb_width_series[-1])
        if np.isnan(current):
            return np.nan
        valid = window[~np.isnan(window)]
        if len(valid) == 0:
            return np.nan
        rank = (valid < current).sum() / len(valid) * 100.0
        return float(rank)

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val >= 20:
            return False
        bbw_pct = self._bb_width_percentile()
        if np.isnan(bbw_pct) or bbw_pct <= 30:
            return False
        atr_pct = float(self._atr_pct_series[-1])
        if np.isnan(atr_pct) or atr_pct >= 85:
            return False
        return True

    def _session_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if self._session_mask_full is None:
            return True
        if 0 <= bar_i < len(self._session_mask_full):
            return bool(self._session_mask_full[bar_i])
        return False

    def _filters_ok(self) -> bool:
        if not self._session_ok():
            return False
        return True

    def _bars_since_last_trade(self) -> int:
        return len(self.data) - 1 - self._last_trade_bar

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return
        if self._bars_since_last_trade() < self._cooldown:
            return

        price = float(self.data.Close[-1])
        atr_val = float(self._atr_series[-1])
        rsi_val = float(self._rsi_series[-1])
        bb_up = float(self._bb_upper[-1])
        bb_lo = float(self._bb_lower[-1])
        bb_mid = float(self._bb_middle[-1])

        if np.isnan(atr_val) or atr_val <= 0:
            return
        if np.isnan(rsi_val) or np.isnan(bb_up) or np.isnan(bb_lo) or np.isnan(bb_mid):
            return

        risk_pct = 0.5
        equity = float(self.equity)

        long_sig = price < bb_lo and rsi_val < 10
        short_sig = price > bb_up and rsi_val > 90

        if long_sig:
            sl = price - 1.5 * atr_val
            tp = bb_mid
            if sl >= price or tp <= price:
                return
            stop_dist = price - sl
            size = risk.lots_by_risk_pct(
                equity=equity,
                risk_pct=risk_pct,
                stop_distance=stop_dist,
                price=price,
                symbol=self._symbol,
            )
            if size is None or size <= 0:
                return
            try:
                units = max(1, int(round(size)))
            except Exception:
                units = 1
            self.sl_price = sl
            self.tp_price = tp
            self.buy(size=units, sl=sl, tp=tp)
            self._last_trade_bar = len(self.data) - 1

        elif short_sig:
            sl = price + 1.5 * atr_val
            tp = bb_mid
            if sl <= price or tp >= price:
                return
            stop_dist = sl - price
            size = risk.lots_by_risk_pct(
                equity=equity,
                risk_pct=risk_pct,
                stop_distance=stop_dist,
                price=price,
                symbol=self._symbol,
            )
            if size is None or size <= 0:
                return
            try:
                units = max(1, int(round(size)))
            except Exception:
                units = 1
            self.sl_price = sl
            self.tp_price = tp
            self.sell(size=units, sl=sl, tp=tp)
            self._last_trade_bar = len(self.data) - 1

    def _manage_open(self) -> None:
        if not self.position:
            return
        time_stop = 30
        if self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return

    def next(self):
        self._enter_if_signal()
        self._manage_open()