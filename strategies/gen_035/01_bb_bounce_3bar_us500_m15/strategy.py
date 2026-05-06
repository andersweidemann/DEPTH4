import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _bb_upper(data, period, dev):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    mid = close.rolling(period).mean()
    std = close.rolling(period).std(ddof=0)
    return (mid + dev * std).to_numpy()


def _bb_lower(data, period, dev):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    mid = close.rolling(period).mean()
    std = close.rolling(period).std(ddof=0)
    return (mid - dev * std).to_numpy()


def _adx_arr(data, period):
    return np.asarray(regime.adx(data.df if hasattr(data, "df") else data, period),
                      dtype=float)


def _atr_pct_arr(data, period, lookback):
    df = data.df if hasattr(data, "df") else data
    return np.asarray(regime.atr_percentile(df, period, lookback), dtype=float)


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists() and not self._spec:
            try:
                self._spec = json.loads(spec_file.read_text())
            except Exception:
                self._spec = {}

        self.spec = dict(self._spec) if self._spec else {}
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)

        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(full_idx, ["london", "ny"]), dtype=bool
        )
        self._broker_spread_points = 0

        self._bb_upper = self.I(_bb_upper, self.data, 20, 2.0)
        self._bb_lower = self.I(_bb_lower, self.data, 20, 2.0)

        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(_adx_arr, self.data, 14)
        self._atr_pct_series = self.I(_atr_pct_arr, self.data, 14, 500)

        self._last_exit_bar = -10_000

    def _regime_ok(self) -> bool:
        i = len(self.data) - 1
        if i < 2:
            return False
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val > 30:
            return False
        ap = float(self._atr_pct_series[-1])
        if np.isnan(ap):
            return False
        if ap < 20 or ap > 90:
            return False
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        idx = self.data.index
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        dd_kill = 0.03
        try:
            dd_kill = config.load()["risk"]["daily_dd_kill_pct"]
        except Exception:
            pass
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False
        return True

    def _three_bar_bounce_lower(self) -> bool:
        if len(self.data) < 4:
            return False
        c1, c2, c3 = float(self.data.Close[-3]), float(self.data.Close[-2]), float(self.data.Close[-1])
        l1, l2 = float(self.data.Low[-3]), float(self.data.Low[-2])
        lb1 = float(self._bb_lower[-3])
        lb2 = float(self._bb_lower[-2])
        lb3 = float(self._bb_lower[-1])
        if any(np.isnan(x) for x in (lb1, lb2, lb3)):
            return False
        poke = (l1 < lb1) or (l2 < lb2) or (c1 < lb1) or (c2 < lb2)
        inside = c3 > lb3
        rising = c3 > c2
        return bool(poke and inside and rising)

    def _three_bar_bounce_upper(self) -> bool:
        if len(self.data) < 4:
            return False
        c1, c2, c3 = float(self.data.Close[-3]), float(self.data.Close[-2]), float(self.data.Close[-1])
        h1, h2 = float(self.data.High[-3]), float(self.data.High[-2])
        ub1 = float(self._bb_upper[-3])
        ub2 = float(self._bb_upper[-2])
        ub3 = float(self._bb_upper[-1])
        if any(np.isnan(x) for x in (ub1, ub2, ub3)):
            return False
        poke = (h1 > ub1) or (h2 > ub2) or (c1 > ub1) or (c2 > ub2)
        inside = c3 < ub3
        falling = c3 < c2
        return bool(poke and inside and falling)

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_exit_bar < 4:
            return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return

        price = float(self.data.Close[-1])
        long_sig = self._three_bar_bounce_lower()
        short_sig = self._three_bar_bounce_upper()

        if not (long_sig or short_sig):
            return

        if long_sig:
            sl = price - 2.0 * atr_now
            tp = price + 3.0 * atr_now
        else:
            sl = price + 2.0 * atr_now
            tp = price - 3.0 * atr_now

        stop_dist = abs(price - sl)
        if stop_dist <= 0:
            return

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=0.5,
                stop_distance=stop_dist,
                price=price,
                symbol=self._symbol,
            )
        except TypeError:
            size = risk.lots_by_risk_pct(self.equity, 0.5, stop_dist, price)

        if size is None or size <= 0:
            return

        if isinstance(size, float) and 0 < size < 1:
            units = size
        else:
            units = max(1, int(size))

        self.sl_price = sl
        self.tp_price = tp

        try:
            if long_sig:
                self.buy(size=units, sl=sl, tp=tp)
            else:
                self.sell(size=units, sl=sl, tp=tp)
        except Exception:
            frac = 0.05
            if long_sig:
                self.buy(size=frac, sl=sl, tp=tp)
            else:
                self.sell(size=frac, sl=sl, tp=tp)

    def _manage_open(self) -> None:
        if not self.position:
            return
        if not self.trades:
            return

        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar

        if bars_open >= 24:
            self.position.close()
            self._last_exit_bar = len(self.data) - 1
            return

        ub = float(self._bb_upper[-1])
        lb = float(self._bb_lower[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])

        if trade.is_long and not np.isnan(ub):
            if high >= ub:
                self.position.close()
                self._last_exit_bar = len(self.data) - 1
                return
        elif (not trade.is_long) and not np.isnan(lb):
            if low <= lb:
                self.position.close()
                self._last_exit_bar = len(self.data) - 1
                return

    def next(self):
        if self.position:
            self._manage_open()
            return
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return
        self._enter_if_signal()