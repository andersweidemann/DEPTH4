import json
from pathlib import Path
import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, regime, risk, config


def _bb_upper(close, period, stddev):
    mid, upper, lower = signals.bollinger(close, period, stddev)
    return upper


def _bb_lower(close, period, stddev):
    mid, upper, lower = signals.bollinger(close, period, stddev)
    return lower


def _bb_mid(close, period, stddev):
    mid, upper, lower = signals.bollinger(close, period, stddev)
    return mid


def _bb_width_arr(close, period, stddev):
    mid, upper, lower = signals.bollinger(close, period, stddev)
    mid_arr = np.asarray(mid, dtype=float)
    width = (np.asarray(upper, dtype=float) - np.asarray(lower, dtype=float))
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(mid_arr != 0, width / np.abs(mid_arr), np.nan)


def _rolling_pct_rank(arr, lookback):
    a = np.asarray(arr, dtype=float)
    out = np.full_like(a, np.nan, dtype=float)
    for i in range(len(a)):
        start = max(0, i - lookback + 1)
        window = a[start:i + 1]
        valid = window[~np.isnan(window)]
        if len(valid) < 5 or np.isnan(a[i]):
            continue
        out[i] = (np.sum(valid <= a[i]) / len(valid)) * 100.0
    return out


def _bb_width_pct(close, period, stddev, lookback):
    w = _bb_width_arr(close, period, stddev)
    return _rolling_pct_rank(w, lookback)


def _atr_pct(data_high, data_low, data_close, period, lookback):
    try:
        atr_vals = signals.atr(pd.DataFrame({
            "High": np.asarray(data_high),
            "Low": np.asarray(data_low),
            "Close": np.asarray(data_close),
        }), period)
    except Exception:
        high = np.asarray(data_high, dtype=float)
        low = np.asarray(data_low, dtype=float)
        close = np.asarray(data_close, dtype=float)
        prev_close = np.concatenate(([close[0]], close[:-1]))
        tr = np.maximum(high - low, np.maximum(np.abs(high - prev_close), np.abs(low - prev_close)))
        atr_vals = pd.Series(tr).rolling(period, min_periods=period).mean().values
    return _rolling_pct_rank(np.asarray(atr_vals, dtype=float), lookback)


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                self._spec = json.loads(spec_file.read_text())
            except Exception:
                pass
        super().init()

        sp = self._spec
        prim = sp.get("signals", {}).get("primary", {})
        conf = sp.get("signals", {}).get("confirm", {})
        self._bb_period = int(prim.get("period", 20))
        self._bb_std = float(prim.get("stddev", 1.75))
        self._rsi_period = int(conf.get("period", 7))
        self._rsi_long_th = float(conf.get("long_threshold", 10))
        self._rsi_short_th = float(conf.get("short_threshold", 90))
        self._cooldown = int(sp.get("signals", {}).get("entry_rules", {}).get("cooldown_bars", 6))

        self._bb_upper = self.I(_bb_upper, self.data.Close, self._bb_period, self._bb_std)
        self._bb_lower = self.I(_bb_lower, self.data.Close, self._bb_period, self._bb_std)
        self._bb_mid = self.I(_bb_mid, self.data.Close, self._bb_period, self._bb_std)
        self._rsi = self.I(signals.rsi, self.data.Close, self._rsi_period)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)

        self._bb_width_pct = self.I(_bb_width_pct, self.data.Close, self._bb_period, self._bb_std, 200)
        self._atr_pct_series = self.I(_atr_pct, self.data.High, self.data.Low, self.data.Close, 14, 300)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(idx, [{"start": "13:30", "end": "20:00", "tz": "UTC"}]),
            dtype=bool,
        )

        self._last_entry_bar = -10_000
        self._trades_today = 0
        self._current_day = None
        self._max_daily_trades = int(sp.get("sizing", {}).get("max_daily_trades", 8))
        self._risk_pct = float(sp.get("sizing", {}).get("risk_per_trade_pct", 0.5))
        self._max_concurrent = int(sp.get("sizing", {}).get("max_concurrent", 1))
        exits = sp.get("exits", {})
        self._sl_atr_mult = float(exits.get("stop_loss", {}).get("multiplier", 1.5))
        self._time_stop_bars = int(exits.get("time_stop", {}).get("value", 30))
        self._fallback_rr = float(exits.get("take_profit", {}).get("fallback_rr", 1.2))
        self._be_after_rr = float(exits.get("breakeven", {}).get("after_rr", 1.0))

    def _regime_ok(self) -> bool:
        bar_i = len(self.data) - 1
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val >= 25:
            return False
        atr_p = float(self._atr_pct_series[-1])
        if np.isnan(atr_p) or atr_p <= 30:
            return False
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def _filters_ok(self) -> bool:
        idx = self.data.index
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if self._current_day != now_date:
            self._current_day = now_date
            self._trades_today = 0
        try:
            daily_kill_pct = self._spec.get("risk", {}).get(
                "daily_dd_kill_pct",
                config.load()["risk"]["daily_dd_kill_pct"],
            )
            if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, daily_kill_pct):
                return False
        except Exception:
            pass
        if self._trades_today >= self._max_daily_trades:
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position and len(self.trades) >= self._max_concurrent:
            return
        if self.position:
            return

        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self._cooldown:
            return

        close = float(self.data.Close[-1])
        upper = float(self._bb_upper[-1])
        lower = float(self._bb_lower[-1])
        mid = float(self._bb_mid[-1])
        rsi_v = float(self._rsi[-1])
        atr_v = float(self._atr_series[-1])
        bbwp = float(self._bb_width_pct[-1])

        if any(np.isnan(x) for x in (upper, lower, mid, rsi_v, atr_v, bbwp)):
            return
        if bbwp <= 30:
            return
        if atr_v <= 0:
            return

        long_sig = close < lower and rsi_v < self._rsi_long_th
        short_sig = close > upper and rsi_v > self._rsi_short_th

        if not (long_sig or short_sig):
            return

        if long_sig:
            sl = close - self._sl_atr_mult * atr_v
            risk_dist = close - sl
            if risk_dist <= 0:
                return
            tp = upper if upper > close else close + self._fallback_rr * risk_dist
            if tp <= close:
                tp = close + self._fallback_rr * risk_dist
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                entry=close,
                stop=sl,
                symbol=self._symbol,
            )
            if size is None or size <= 0:
                return
            try:
                self.sl_price = sl
                self.tp_price = tp
                if isinstance(size, float) and 0 < size < 1:
                    self.buy(size=size, sl=sl, tp=tp)
                else:
                    self.buy(size=max(1, int(size)), sl=sl, tp=tp)
                self._last_entry_bar = bar_i
                self._trades_today += 1
            except Exception:
                return
        else:
            sl = close + self._sl_atr_mult * atr_v
            risk_dist = sl - close
            if risk_dist <= 0:
                return
            tp = lower if lower < close else close - self._fallback_rr * risk_dist
            if tp >= close:
                tp = close - self._fallback_rr * risk_dist
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                entry=close,
                stop=sl,
                symbol=self._symbol,
            )
            if size is None or size <= 0:
                return
            try:
                self.sl_price = sl
                self.tp_price = tp
                if isinstance(size, float) and 0 < size < 1:
                    self.sell(size=size, sl=sl, tp=tp)
                else:
                    self.sell(size=max(1, int(size)), sl=sl, tp=tp)
                self._last_entry_bar = bar_i
                self._trades_today += 1
            except Exception:
                return

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return
        price = float(self.data.Close[-1])
        atr_v = float(self._atr_series[-1])
        mid = float(self._bb_mid[-1])

        for trade in self.trades:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self._time_stop_bars:
                trade.close()
                continue

            entry = trade.entry_price
            if trade.sl is None:
                continue
            init_risk = abs(entry - trade.sl)
            if init_risk <= 0:
                continue

            if trade.is_long:
                rr = (price - entry) / init_risk
                if rr >= self._be_after_rr and (trade.sl is None or trade.sl < entry):
                    trade.sl = entry
                if not np.isnan(mid) and price >= mid:
                    trade.close()
            else:
                rr = (entry - price) / init_risk
                if rr >= self._be_after_rr and (trade.sl is None or trade.sl > entry):
                    trade.sl = entry
                if not np.isnan(mid) and price <= mid:
                    trade.close()

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()