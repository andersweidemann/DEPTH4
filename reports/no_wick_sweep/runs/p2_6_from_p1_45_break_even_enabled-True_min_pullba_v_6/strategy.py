"""
GER40 (DAX) M30 — no-wick retest + toggles for research (see ``spec.json`` ``signal``).

All optional filters default **off** except ``wick_strict_zero`` (true = ~0%% lower/upper wick).
Toggle fields under ``signal`` to compare PF / trade count on the same IS window.

**SL / TP:** SL is **below** the lowest low of bars ``i…j`` (long) or **above** the
highest high (short), plus ``sl_buffer_points`` × tick size and optional
``sl_buffer_atr_mult × ATR(i)``. Entry stays at the retest price (signal high /
low). Then ``TP = entry ± tp_r_mult × |entry − SL|`` (default 1:1).
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

import numpy as np
import pandas as pd

from agents import config, risk
from agents.backtester import RegimeStrategy


def _ema(close: np.ndarray, span: int) -> np.ndarray:
    return pd.Series(close, dtype=float).ewm(span=span, adjust=False).mean().to_numpy()


def _trend_masks(close: np.ndarray, fast: int, slow: int) -> Tuple[np.ndarray, np.ndarray]:
    ef = _ema(close, fast)
    es = _ema(close, slow)
    ok = np.isfinite(ef) & np.isfinite(es)
    bull = ok & (ef > es) & (close > es)
    bear = ok & (ef < es) & (close < es)
    return bull, bear


def _atr_wilder(h: np.ndarray, l: np.ndarray, c: np.ndarray, period: int) -> np.ndarray:
    n = len(c)
    prev_c = np.roll(c, 1)
    prev_c[0] = c[0]
    tr = np.maximum(h - l, np.maximum(np.abs(h - prev_c), np.abs(l - prev_c)))
    atr = np.full(n, np.nan, dtype=float)
    if n < period + 1:
        return atr
    atr[period - 1] = float(np.nanmean(tr[1:period]))
    for i in range(period, n):
        atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
    return atr


def _rolling_atr_percentile(atr: np.ndarray, lookback: int) -> np.ndarray:
    """0–100 percentile rank of ATR[i] within prior ``lookback`` bars (inclusive)."""
    n = len(atr)
    out = np.full(n, np.nan, dtype=float)
    for i in range(n):
        lo = max(0, i - lookback + 1)
        win = atr[lo: i + 1]
        win = win[np.isfinite(win)]
        if len(win) < 5:
            continue
        a = atr[i]
        if not np.isfinite(a):
            continue
        out[i] = 100.0 * float(np.sum(win <= a)) / float(len(win))
    return out


def _higher_tf_trend_masks(
    idx: pd.DatetimeIndex,
    O: np.ndarray,
    H: np.ndarray,
    L: np.ndarray,
    C: np.ndarray,
    fast: int,
    slow: int,
    rule: str,
) -> Tuple[np.ndarray, np.ndarray]:
    """Resample OHLC to ``rule`` (e.g. ``1h``), trend masks, forward-fill to M30 index."""
    df = pd.DataFrame(
        {"Open": O, "High": H, "Low": L, "Close": C},
        index=idx,
    )
    dfh = df.resample(rule, label="left", closed="left").agg(
        {"Open": "first", "High": "max", "Low": "min", "Close": "last"},
    ).dropna(subset=["Open", "High", "Low", "Close"])
    if len(dfh) < slow + 5:
        return np.zeros(len(idx), dtype=bool), np.zeros(len(idx), dtype=bool)
    ch = dfh["Close"].to_numpy(dtype=float)
    tl, ts = _trend_masks(ch, fast, slow)
    s_tl = pd.Series(tl, index=dfh.index)
    s_ts = pd.Series(ts, index=dfh.index)
    ff_tl = s_tl.reindex(idx, method="ffill").fillna(False).to_numpy()
    ff_ts = s_ts.reindex(idx, method="ffill").fillna(False).to_numpy()
    return ff_tl.astype(bool), ff_ts.astype(bool)


def _wick_bull(
    o: float, h: float, l: float, c: float,
    *,
    strict: bool,
    pt: float,
    eps_mult: float,
    atol_mult: float,
) -> bool:
    if strict:
        atol = max(float(pt) * float(atol_mult), 1e-15)
        return bool(abs(o - l) <= atol and c > o)
    eps = float(pt) * float(eps_mult)
    return bool(abs(o - l) <= eps and c > o)


def _wick_bear(
    o: float, h: float, l: float, c: float,
    *,
    strict: bool,
    pt: float,
    eps_mult: float,
    atol_mult: float,
) -> bool:
    if strict:
        atol = max(float(pt) * float(atol_mult), 1e-15)
        return bool(abs(o - h) <= atol and c < o)
    eps = float(pt) * float(eps_mult)
    return bool(abs(o - h) <= eps and c < o)


def _body_ok_bull(o: float, h: float, l: float, c: float, min_frac: float) -> bool:
    if min_frac <= 0:
        return True
    rng = h - l
    if rng <= 1e-12:
        return False
    return (c - o) / rng >= min_frac


def _body_ok_bear(o: float, h: float, l: float, c: float, min_frac: float) -> bool:
    if min_frac <= 0:
        return True
    rng = h - l
    if rng <= 1e-12:
        return False
    return (o - c) / rng >= min_frac


def _close_extreme_bull(c: float, h: float, l: float, frac: float) -> bool:
    if frac <= 0:
        return True
    rng = h - l
    if rng <= 1e-12:
        return False
    return c >= h - frac * rng


def _close_extreme_bear(c: float, h: float, l: float, frac: float) -> bool:
    if frac <= 0:
        return True
    rng = h - l
    if rng <= 1e-12:
        return False
    return c <= l + frac * rng


def _precompute(
    O: np.ndarray,
    H: np.ndarray,
    L: np.ndarray,
    C: np.ndarray,
    atr: np.ndarray,
    atr_pct: Optional[np.ndarray],
    max_wait: int,
    trend_long: np.ndarray,
    trend_short: np.ndarray,
    cfg: Dict[str, Any],
    pt: float,
) -> Tuple[
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
]:
    strict = bool(cfg.get("wick_strict_zero", True))
    eps_mult = float(cfg.get("wick_epsilon_mult", 0.55))
    atol_mult = float(cfg.get("wick_zero_atol_mult", 1e-9))
    tp_r = float(cfg.get("tp_r_mult", 1.0))
    min_body = float(cfg.get("min_body_frac_of_range", 0.0))
    close_ex = float(cfg.get("close_near_extreme_frac", 0.0))
    pb_atr = float(cfg.get("min_pullback_atr_mult", 0.0))
    confirm = bool(cfg.get("confirm_close_beyond_level", False))
    vol_on = bool(cfg.get("vol_filter_enabled", False))
    ap_lo = float(cfg.get("atr_percentile_min", 0.0))
    ap_hi = float(cfg.get("atr_percentile_max", 100.0))
    buf_pts = float(cfg.get("sl_buffer_points", 2.0))
    buf_atr_m = float(cfg.get("sl_buffer_atr_mult", 0.0))

    n = len(O)
    long_e = np.zeros(n, dtype=bool)
    long_entry = np.full(n, np.nan)
    long_sl = np.full(n, np.nan)
    long_tp = np.full(n, np.nan)
    short_e = np.zeros(n, dtype=bool)
    short_entry = np.full(n, np.nan)
    short_sl = np.full(n, np.nan)
    short_tp = np.full(n, np.nan)

    for i in range(n):
        o, h, l, c = float(O[i]), float(H[i]), float(L[i]), float(C[i])
        bull = _wick_bull(o, h, l, c, strict=strict, pt=pt, eps_mult=eps_mult, atol_mult=atol_mult)
        bear = _wick_bear(o, h, l, c, strict=strict, pt=pt, eps_mult=eps_mult, atol_mult=atol_mult)
        bull = bull and _body_ok_bull(o, h, l, c, min_body) and _close_extreme_bull(c, h, l, close_ex)
        bear = bear and _body_ok_bear(o, h, l, c, min_body) and _close_extreme_bear(c, h, l, close_ex)
        if not bull and not bear:
            continue
        ai = float(atr[i]) if i < len(atr) and np.isfinite(atr[i]) else 0.0

        if bull and h > l:
            hi, lo = h, l
            buf = buf_pts * pt + (buf_atr_m * ai if buf_atr_m > 0 and ai > 0 else 0.0)
            pull = False
            j_end = min(n, i + 1 + max_wait)
            for j in range(i + 1, j_end):
                if not pull:
                    thr = hi - (pb_atr * ai if pb_atr > 0 and ai > 0 else 0.0)
                    if float(L[j]) < thr - 1e-12:
                        pull = True
                else:
                    touch = float(L[j]) <= hi <= float(H[j])
                    if confirm:
                        touch = touch and float(C[j]) >= hi - 1e-12
                    if touch:
                        ok_vol = True
                        if vol_on and atr_pct is not None and j < len(atr_pct):
                            ap = atr_pct[j]
                            ok_vol = np.isfinite(ap) and (ap_lo <= ap <= ap_hi)
                        if ok_vol and not long_e[j] and bool(trend_long[j]):
                            seg_lo = float(np.min(L[i: j + 1]))
                            sl_px = seg_lo - buf
                            if sl_px >= hi - 1e-9:
                                break
                            one_r = hi - sl_px
                            if one_r <= 1e-9:
                                break
                            long_e[j] = True
                            long_entry[j] = hi
                            long_sl[j] = sl_px
                            long_tp[j] = hi + tp_r * one_r
                        break

        if bear and h > l:
            hi, lo = h, l
            buf = buf_pts * pt + (buf_atr_m * ai if buf_atr_m > 0 and ai > 0 else 0.0)
            pull = False
            j_end = min(n, i + 1 + max_wait)
            for j in range(i + 1, j_end):
                if not pull:
                    thr = lo + (pb_atr * ai if pb_atr > 0 and ai > 0 else 0.0)
                    if float(H[j]) > thr + 1e-12:
                        pull = True
                else:
                    touch = float(L[j]) <= lo <= float(H[j])
                    if confirm:
                        touch = touch and float(C[j]) <= lo + 1e-12
                    if touch:
                        ok_vol = True
                        if vol_on and atr_pct is not None and j < len(atr_pct):
                            ap = atr_pct[j]
                            ok_vol = np.isfinite(ap) and (ap_lo <= ap <= ap_hi)
                        if ok_vol and not short_e[j] and bool(trend_short[j]):
                            seg_hi = float(np.max(H[i: j + 1]))
                            sl_px = seg_hi + buf
                            if sl_px <= lo + 1e-9:
                                break
                            one_r = sl_px - lo
                            if one_r <= 1e-9:
                                break
                            short_e[j] = True
                            short_entry[j] = lo
                            short_sl[j] = sl_px
                            short_tp[j] = lo - tp_r * one_r
                        break

    return long_e, long_entry, long_sl, long_tp, short_e, short_entry, short_sl, short_tp


def _point_eps(symbol: str) -> float:
    pt = float(risk.SYMBOL_DEFAULTS.get(symbol.upper(), {"point_size": 0.01})["point_size"])
    return pt


def _hhmm_to_minutes(hhmm: str) -> int:
    parts = str(hhmm).strip().split(":")
    h = int(parts[0])
    m = int(parts[1]) if len(parts) > 1 else 0
    return h * 60 + m


class Strategy(RegimeStrategy):
    spec_path = "spec.json"
    # max_spread_points + daily_kill_ok: enforced in RegimeStrategy._filters_ok

    def init(self) -> None:
        super().init()
        sig: Dict[str, Any] = self.spec.get("signal", {})
        max_wait = int(sig.get("max_wait_bars", 48))
        ema_fast = int(sig.get("trend_ema_fast", 50))
        ema_slow = int(sig.get("trend_ema_slow", 200))
        if ema_fast >= ema_slow:
            raise ValueError("signal.trend_ema_fast must be < signal.trend_ema_slow")

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        if not isinstance(idx, pd.DatetimeIndex):
            idx = pd.DatetimeIndex(idx)

        O = np.asarray(self.data.Open, dtype=float)
        H = np.asarray(self.data.High, dtype=float)
        L = np.asarray(self.data.Low, dtype=float)
        C = np.asarray(self.data.Close, dtype=float)

        pt = _point_eps(self._symbol)
        atr_period = int(sig.get("atr_period", 14))
        atr = _atr_wilder(H, L, C, atr_period)
        look = int(sig.get("atr_percentile_lookback", 500))
        atr_pct: Optional[np.ndarray] = None
        if bool(sig.get("vol_filter_enabled", False)):
            atr_pct = _rolling_atr_percentile(atr, look)

        src = str(sig.get("trend_source", "m30")).lower().strip()
        tl_m, ts_m = _trend_masks(C, ema_fast, ema_slow)
        trend_long, trend_short = tl_m, ts_m
        if src in ("h1", "1h", "and", "or"):
            tl_h, ts_h = _higher_tf_trend_masks(idx, O, H, L, C, ema_fast, ema_slow, "1h")
            if src in ("h1", "1h"):
                trend_long, trend_short = tl_h, ts_h
            elif src == "and":
                trend_long = tl_m & tl_h
                trend_short = ts_m & ts_h
            elif src == "or":
                trend_long = tl_m | tl_h
                trend_short = ts_m | ts_h

        (
            self._long_e,
            self._long_entry,
            self._long_sl,
            self._long_tp,
            self._short_e,
            self._short_entry,
            self._short_sl,
            self._short_tp,
        ) = _precompute(O, H, L, C, atr, atr_pct, max_wait, trend_long, trend_short, sig, pt)

        self._trades_today = 0
        self._trade_day: Optional[str] = None
        self._block_entries_until_bar = -1

    def _filters_ok(self) -> bool:
        filters = self.spec.get("filters", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        if bar_i < 0:
            return False

        sess = filters.get("session_local")
        if isinstance(sess, dict) and sess.get("start") and sess.get("end"):
            tz_name = str(sess.get("timezone", "Europe/Berlin"))
            start_m = _hhmm_to_minutes(str(sess["start"]))
            end_m = _hhmm_to_minutes(str(sess["end"]))
            raw = idx[bar_i]
            ts = pd.Timestamp(raw)
            if ts.tzinfo is None:
                ts = ts.tz_localize("UTC")
            else:
                ts = ts.tz_convert("UTC")
            local = ts.tz_convert(tz_name)
            minutes = int(local.hour) * 60 + int(local.minute)
            if not (start_m <= minutes < end_m):
                return False

        max_spread = filters.get("max_spread_points")
        if max_spread is not None:
            if not risk.spread_ok(self._broker_spread_points, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not risk.daily_kill_ok(
            self._kill_state,
            now_date,
            self.equity,
            self.spec.get("risk", {}).get(
                "daily_dd_kill_pct",
                config.load()["risk"]["daily_dd_kill_pct"],
            ),
        ):
            return False
        return True

    def _manage_open(self) -> None:
        super()._manage_open()
        sig = self.spec.get("signal", {})
        if bool(sig.get("break_even_enabled", False)):
            trig = float(sig.get("break_even_trigger_r", 0.5))
            price = float(self.data.Close[-1])
            for t in self.trades:
                if t.sl is None:
                    continue
                if t.is_long:
                    r = float(t.entry_price) - float(t.sl)
                    if r > 0 and (price - float(t.entry_price)) / r >= trig:
                        t.sl = max(float(t.sl), float(t.entry_price))
                else:
                    r = float(t.sl) - float(t.entry_price)
                    if r > 0 and (float(t.entry_price) - price) / r >= trig:
                        t.sl = min(float(t.sl), float(t.entry_price))
        bar_i = len(self.data) - 1
        if bar_i >= 0:
            self._loss_cooldown_update(bar_i)

    def _size_frac(self, lots: float, price: float) -> float:
        params = risk.SYMBOL_DEFAULTS.get(
            self._symbol.upper(), {"point_size": 0.01, "contract_size": 1.0},
        )
        notional = float(lots) * float(params["contract_size"]) * float(price)
        if self.equity <= 0:
            return 0.02
        return max(0.01, min(0.99, notional / float(self.equity)))

    def _loss_cooldown_update(self, bar_i: int) -> None:
        sig = self.spec.get("signal", {})
        cool = int(sig.get("cooldown_bars_after_loss", 0))
        if cool <= 0:
            return
        for t in self.closed_trades:
            eb = t.exit_bar
            if eb is None:
                continue
            if int(eb) == bar_i and float(t.pl) < 0:
                self._block_entries_until_bar = bar_i + cool
                break

    def next(self) -> None:
        if len(self.data) < 3:
            return
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        i = len(self.data) - 1

        self._manage_open()
        if self.position:
            return

        if i < 0 or i >= len(self._long_e):
            return

        sig = self.spec.get("signal", {})
        if i < int(getattr(self, "_block_entries_until_bar", -1)):
            return

        max_td = int(sig.get("max_trades_per_day", 0))
        idx = self.data.index
        d = pd.Timestamp(idx[i]).strftime("%Y-%m-%d")
        if d != self._trade_day:
            self._trade_day = d
            self._trades_today = 0
        if max_td > 0 and self._trades_today >= max_td:
            return

        pt = _point_eps(self._symbol)
        risk_pct = float(self.spec.get("sizing", {}).get("risk_pct", 0.5))
        equity = float(self.equity)

        if self._long_e[i]:
            entry = float(self._long_entry[i])
            sl = float(self._long_sl[i])
            tp = float(self._long_tp[i])
            if not (np.isfinite(entry) and np.isfinite(sl) and np.isfinite(tp)):
                return
            if not (sl < entry < tp):
                return
            self.sl_price = sl
            self.tp_price = tp
            sl_points = abs(entry - sl) / pt
            lots = risk.lots_by_risk_pct(equity, sl_points, risk_pct, self._symbol)
            if lots > 0:
                self.buy(size=self._size_frac(lots, entry), limit=entry, sl=sl, tp=tp)
                self._trades_today += 1

        elif self._short_e[i]:
            entry = float(self._short_entry[i])
            sl = float(self._short_sl[i])
            tp = float(self._short_tp[i])
            if not (np.isfinite(entry) and np.isfinite(sl) and np.isfinite(tp)):
                return
            if not (tp < entry < sl):
                return
            self.sl_price = sl
            self.tp_price = tp
            sl_points = abs(sl - entry) / pt
            lots = risk.lots_by_risk_pct(equity, sl_points, risk_pct, self._symbol)
            if lots > 0:
                self.sell(size=self._size_frac(lots, entry), limit=entry, sl=sl, tp=tp)
                self._trades_today += 1
