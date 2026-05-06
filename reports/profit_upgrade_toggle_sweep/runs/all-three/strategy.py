"""
GER40 (DAX) M30 — no-wick retest + toggles for research (see ``spec.json`` ``signal``).

All optional filters default **off** except ``wick_strict_zero`` (true = ~0%% lower/upper wick).
Toggle fields under ``signal`` to compare PF / trade count on the same IS window.

**SL / TP:** SL is **below** the lowest low of bars ``i…j`` (long) or **above** the
highest high (short), plus ``sl_buffer_points`` × tick size and optional
``sl_buffer_atr_mult × ATR(i)``. Entry stays at the retest price (signal high /
low). Then ``TP = entry ± tp_r_mult × |entry − SL|`` (default 1:1).

**Open-trade management (PF-oriented):** optional ``break_even_mfe_r`` lifts SL
to entry when **MFE** (max favorable excursion since entry, bar High/Low) reaches
``break_even_mfe_r × R`` even if the bar **Close** has not yet reached
``break_even_trigger_r``. Optional ``mfe_trail_*`` tightens SL to
``peak − giveback×R`` (long) once MFE reaches ``activate`` × R, addressing
give-back losses seen in TV trade exports.

**Profit toggles (spec, default off):**
- ``scale_out_*`` — close ``scale_out_fraction`` of the position once price reaches
  ``scale_out_at_r`` × R (R = |entry−SL|); remainder keeps the original bracket TP.
  Optional ``scale_out_runner_trail_*`` applies an MFE trail only after the partial.
- ``regime_tp_*`` — at the entry bar, pick ``tp_r_mult_volatile`` vs ``tp_r_mult_quiet``
  from rolling ATR percentile vs ``regime_tp_atr_pct_threshold`` (needs ATR percentile
  series: computed when ``vol_filter_enabled`` or ``regime_tp_enabled``).
- ``asymmetric_ls`` — when ``enabled``, merge ``asymmetric_ls.long`` / ``.short`` dicts
  over ``signal`` for that side (e.g. ``tp_r_mult``, ``sl_buffer_points``,
  ``block_entry_hours_local``).
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

import numpy as np
import pandas as pd

from agents import config, regime as regime_mod, risk
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


def _signal_side(sig: Dict[str, Any], side: str) -> Dict[str, Any]:
    """Return signal dict for one side; merge ``asymmetric_ls.{long|short}`` when enabled."""
    asym = sig.get("asymmetric_ls")
    if not isinstance(asym, dict) or not bool(asym.get("enabled", False)):
        return sig
    key = "long" if side == "long" else "short"
    ov = asym.get(key)
    if not isinstance(ov, dict):
        return sig
    out = dict(sig)
    for k, v in ov.items():
        if v is not None:
            out[k] = v
    return out


def _tp_r_for_entry_bar(
    cfg: Dict[str, Any],
    atr_pct: Optional[np.ndarray],
    j: int,
) -> float:
    """Effective TP R-multiple at signal bar ``j`` (regime TP or flat ``tp_r_mult``)."""
    base = float(cfg.get("tp_r_mult", 1.0))
    if not bool(cfg.get("regime_tp_enabled", False)):
        return base
    thr = float(cfg.get("regime_tp_atr_pct_threshold", 70.0))
    quiet = float(cfg.get("tp_r_mult_quiet", base))
    vol = float(cfg.get("tp_r_mult_volatile", base))
    if atr_pct is None or j < 0 or j >= len(atr_pct):
        return base
    ap = float(atr_pct[j])
    if not np.isfinite(ap):
        return base
    return vol if ap >= thr else quiet


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
    cfg_long = _signal_side(cfg, "long")
    cfg_short = _signal_side(cfg, "short")

    strict = bool(cfg.get("wick_strict_zero", True))
    eps_mult = float(cfg.get("wick_epsilon_mult", 0.55))
    atol_mult = float(cfg.get("wick_zero_atol_mult", 1e-9))
    min_body = float(cfg.get("min_body_frac_of_range", 0.0))
    close_ex = float(cfg.get("close_near_extreme_frac", 0.0))
    pb_atr = float(cfg.get("min_pullback_atr_mult", 0.0))
    confirm = bool(cfg.get("confirm_close_beyond_level", False))

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
            cl = cfg_long
            vol_on = bool(cl.get("vol_filter_enabled", False))
            ap_lo = float(cl.get("atr_percentile_min", 0.0))
            ap_hi = float(cl.get("atr_percentile_max", 100.0))
            buf_pts = float(cl.get("sl_buffer_points", 2.0))
            buf_atr_m = float(cl.get("sl_buffer_atr_mult", 0.0))
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
                            tp_r = _tp_r_for_entry_bar(cl, atr_pct, j)
                            long_e[j] = True
                            long_entry[j] = hi
                            long_sl[j] = sl_px
                            long_tp[j] = hi + tp_r * one_r
                        break

        if bear and h > l:
            cs = cfg_short
            vol_on = bool(cs.get("vol_filter_enabled", False))
            ap_lo = float(cs.get("atr_percentile_min", 0.0))
            ap_hi = float(cs.get("atr_percentile_max", 100.0))
            buf_pts = float(cs.get("sl_buffer_points", 2.0))
            buf_atr_m = float(cs.get("sl_buffer_atr_mult", 0.0))
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
                            tp_r = _tp_r_for_entry_bar(cs, atr_pct, j)
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


def _local_hour(idx: pd.DatetimeIndex, bar_i: int, tz_name: str) -> int:
    raw = idx[bar_i]
    ts = pd.Timestamp(raw)
    if ts.tzinfo is None:
        ts = ts.tz_localize("UTC")
    else:
        ts = ts.tz_convert("UTC")
    return int(ts.tz_convert(tz_name).hour)


def _initial_r_long(t: Any, sig: Dict[str, Any]) -> float:
    """One R in price units = distance entry → SL (geometric risk), robust to regime TP."""
    ep = float(t.entry_price)
    slv = t.sl
    if slv is not None:
        r = ep - float(slv)
        if r > 1e-12:
            return r
    tp_r = float(sig.get("tp_r_mult", 1.0))
    tpv = t.tp
    if tpv is not None:
        tpf = float(tpv)
        if np.isfinite(tpf) and tpf > ep + 1e-9 and tp_r > 1e-12:
            return (tpf - ep) / tp_r
    return 0.0


def _initial_r_short(t: Any, sig: Dict[str, Any]) -> float:
    ep = float(t.entry_price)
    slv = t.sl
    if slv is not None:
        r = float(slv) - ep
        if r > 1e-12:
            return r
    tp_r = float(sig.get("tp_r_mult", 1.0))
    tpv = t.tp
    if tpv is not None:
        tpf = float(tpv)
        if np.isfinite(tpf) and tpf < ep - 1e-9 and tp_r > 1e-12:
            return (ep - tpf) / tp_r
    return 0.0


def _mfe_r_long(H: np.ndarray, entry: float, risk_r: float, entry_bar: int, bar_i: int) -> float:
    if risk_r <= 1e-12:
        return 0.0
    seg = H[entry_bar : bar_i + 1]
    if seg.size == 0:
        return 0.0
    peak = float(np.max(seg))
    return max(0.0, (peak - entry) / risk_r)


def _mfe_r_short(L: np.ndarray, entry: float, risk_r: float, entry_bar: int, bar_i: int) -> float:
    if risk_r <= 1e-12:
        return 0.0
    seg = L[entry_bar : bar_i + 1]
    if seg.size == 0:
        return 0.0
    trough = float(np.min(seg))
    return max(0.0, (entry - trough) / risk_r)


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
        if bool(sig.get("vol_filter_enabled", False)) or bool(sig.get("regime_tp_enabled", False)):
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
        self._scaleout_fired = False
        self._H_arr = H
        self._L_arr = L

        rf = self.spec.get("regime_filter")
        if isinstance(rf, dict) and str(rf.get("indicator", "")).lower() == "adx":
            adx_p = int(rf.get("period", 14))
            self._adx_series = self.I(regime_mod.adx, self.data, adx_p)

    def _regime_ok(self) -> bool:
        # ADX / classify filters apply to **new entries** only; keep managing open trades.
        if self.position:
            return True
        return super()._regime_ok()

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

    def _apply_scale_out_exit(self) -> None:
        """Optional partial exit at ``scale_out_at_r``; remainder keeps bracket TP."""
        sig = self.spec.get("signal", {})
        if not bool(sig.get("scale_out_enabled", False)):
            return
        if not self.position or self._scaleout_fired:
            return
        at_r = float(sig.get("scale_out_at_r", 2.0))
        frac = float(sig.get("scale_out_fraction", 0.5))
        if not (at_r > 0 and 0 < frac < 1):
            return
        bar_i = len(self.data) - 1
        if bar_i < 0:
            return
        min_held = max(1, int(sig.get("scale_out_min_bars_held", 1)))
        H = self._H_arr
        L = self._L_arr
        for t in self.trades:
            if t.sl is None:
                continue
            eb = int(t.entry_bar)
            if bar_i - eb < min_held:
                continue
            risk_r = _initial_r_long(t, sig) if t.is_long else _initial_r_short(t, sig)
            if risk_r <= 1e-12:
                continue
            ep = float(t.entry_price)
            if t.is_long:
                if float(H[bar_i]) + 1e-12 < ep + at_r * risk_r:
                    continue
            else:
                if float(L[bar_i]) - 1e-12 > ep - at_r * risk_r:
                    continue
            self.position.close(frac)
            self._scaleout_fired = True
            return

    def _manage_open(self) -> None:
        self._apply_scale_out_exit()
        super()._manage_open()
        sig = self.spec.get("signal", {})
        bar_i = len(self.data) - 1
        if bar_i < 0:
            return

        be_on = bool(sig.get("break_even_enabled", False))
        trig_close = float(sig.get("break_even_trigger_r", 0.5))
        trig_mfe = float(sig.get("break_even_mfe_r", 0.0))
        trail_on = bool(sig.get("mfe_trail_enabled", False))
        trail_act = float(sig.get("mfe_trail_activate_r", 0.45))
        trail_gb = float(sig.get("mfe_trail_giveback_r", 0.5))
        min_mfe_bars = max(0, int(sig.get("min_bars_before_mfe_management", 0)))

        H = self._H_arr
        L = self._L_arr

        if be_on or trail_on:
            price = float(self.data.Close[-1])
            for t in self.trades:
                if t.sl is None:
                    continue
                ep = float(t.entry_price)
                eb = int(t.entry_bar)
                held = bar_i - eb
                if t.is_long:
                    risk_r = _initial_r_long(t, sig)
                    if risk_r <= 1e-12:
                        continue
                    hit_be = False
                    if be_on:
                        if (price - ep) / risk_r >= trig_close:
                            hit_be = True
                        if (
                            trig_mfe > 0
                            and held >= min_mfe_bars
                            and _mfe_r_long(H, ep, risk_r, eb, bar_i) >= trig_mfe
                        ):
                            hit_be = True
                        if hit_be:
                            t.sl = max(float(t.sl), ep)
                    if trail_on and trail_act > 0 and trail_gb > 0 and held >= min_mfe_bars:
                        mfe_r = _mfe_r_long(H, ep, risk_r, eb, bar_i)
                        if mfe_r >= trail_act:
                            seg = H[eb : bar_i + 1]
                            peak = float(np.max(seg)) if seg.size else ep
                            raw_sl = peak - trail_gb * risk_r
                            new_sl = max(ep, raw_sl)
                            t.sl = max(float(t.sl), new_sl)
                else:
                    risk_r = _initial_r_short(t, sig)
                    if risk_r <= 1e-12:
                        continue
                    hit_be = False
                    if be_on:
                        if (ep - price) / risk_r >= trig_close:
                            hit_be = True
                        if (
                            trig_mfe > 0
                            and held >= min_mfe_bars
                            and _mfe_r_short(L, ep, risk_r, eb, bar_i) >= trig_mfe
                        ):
                            hit_be = True
                        if hit_be:
                            t.sl = min(float(t.sl), ep)
                    if trail_on and trail_act > 0 and trail_gb > 0 and held >= min_mfe_bars:
                        mfe_r = _mfe_r_short(L, ep, risk_r, eb, bar_i)
                        if mfe_r >= trail_act:
                            seg = L[eb : bar_i + 1]
                            trough = float(np.min(seg)) if seg.size else ep
                            raw_sl = trough + trail_gb * risk_r
                            new_sl = min(ep, raw_sl)
                            t.sl = min(float(t.sl), new_sl)

        runner_trail = bool(sig.get("scale_out_runner_trail_enabled", False))
        r_act = float(sig.get("scale_out_trail_activate_r", sig.get("mfe_trail_activate_r", 0.45)))
        r_gb = float(sig.get("scale_out_trail_giveback_r", sig.get("mfe_trail_giveback_r", 0.5)))
        if self._scaleout_fired and runner_trail and r_act > 0 and r_gb > 0:
            for t in self.trades:
                if t.sl is None:
                    continue
                ep = float(t.entry_price)
                eb = int(t.entry_bar)
                held = bar_i - eb
                if held < min_mfe_bars:
                    continue
                if t.is_long:
                    risk_r = _initial_r_long(t, sig)
                    if risk_r <= 1e-12:
                        continue
                    mfe_r = _mfe_r_long(H, ep, risk_r, eb, bar_i)
                    if mfe_r >= r_act:
                        seg = H[eb : bar_i + 1]
                        peak = float(np.max(seg)) if seg.size else ep
                        raw_sl = peak - r_gb * risk_r
                        new_sl = max(ep, raw_sl)
                        t.sl = max(float(t.sl), new_sl)
                else:
                    risk_r = _initial_r_short(t, sig)
                    if risk_r <= 1e-12:
                        continue
                    mfe_r = _mfe_r_short(L, ep, risk_r, eb, bar_i)
                    if mfe_r >= r_act:
                        seg = L[eb : bar_i + 1]
                        trough = float(np.min(seg)) if seg.size else ep
                        raw_sl = trough + r_gb * risk_r
                        new_sl = min(ep, raw_sl)
                        t.sl = min(float(t.sl), new_sl)

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
        i = len(self.data) - 1
        if i < 0 or i >= len(self._long_e):
            return

        if not self.position:
            self._scaleout_fired = False

        # Run management (BE, MFE trail, time stop, loss cooldown) every bar; regime/session
        # gates below apply only when flat.
        self._manage_open()
        if self.position:
            return
        if not self._regime_ok():
            return
        if not self._filters_ok():
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
            sig_long = _signal_side(sig, "long")
            blocked_hours = sig_long.get("block_entry_hours_local")
            if isinstance(blocked_hours, list) and blocked_hours:
                sess = self.spec.get("filters", {}).get("session_local")
                tz_name = str(sess.get("timezone", "Europe/Berlin")) if isinstance(sess, dict) else "Europe/Berlin"
                if not isinstance(idx, pd.DatetimeIndex):
                    idx = pd.DatetimeIndex(idx)
                if _local_hour(idx, i, tz_name) in {int(h) for h in blocked_hours}:
                    return
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
            sig_short = _signal_side(sig, "short")
            blocked_hours = sig_short.get("block_entry_hours_local")
            if isinstance(blocked_hours, list) and blocked_hours:
                sess = self.spec.get("filters", {}).get("session_local")
                tz_name = str(sess.get("timezone", "Europe/Berlin")) if isinstance(sess, dict) else "Europe/Berlin"
                if not isinstance(idx, pd.DatetimeIndex):
                    idx = pd.DatetimeIndex(idx)
                if _local_hour(idx, i, tz_name) in {int(h) for h in blocked_hours}:
                    return
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
