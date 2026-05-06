#!/usr/bin/env python3
"""
Offline backtest for GK XAUUSD Sniper logic (mirrors mt5/Experts/GK_XAUUSD_Sniper_Adaptive.mq5).
Chronological bars: index 0 = oldest, -1 = newest. Signal evaluated when bar i closes (same as EA new bar).
"""
from __future__ import annotations

import math
import sys
from dataclasses import dataclass

import numpy as np
import pandas as pd


# --- defaults match EA / Pine
MAIN_LEN = 25
FAST_LEN = 9
EMA_BIAS_LEN = 200
ATR_LEN = 14
STRUCTURE_LOOKBACK = 5
SLOPE_LOOKBACK = 2
PULLBACK_WINDOW = 2
MIN_BODY_ATR = 0.18
MIN_SLOPE_ATR = 0.08
MIN_SEP_ATR = 0.08
MAX_STRETCH_ATR = 1.25
CHOP_THRESH_ATR = 0.16
SCORE_TO_PRINT = 3
TP_MOVE = 11.0


def ema_chronological(src: np.ndarray, length: int) -> np.ndarray:
    alpha = 2.0 / (length + 1)
    out = np.empty_like(src, dtype=np.float64)
    out[0] = src[0]
    for i in range(1, len(src)):
        out[i] = alpha * src[i] + (1.0 - alpha) * out[i - 1]
    return out


def wilder_atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, length: int) -> np.ndarray:
    n = len(close)
    tr = np.zeros(n, dtype=np.float64)
    tr[0] = high[0] - low[0]
    for i in range(1, n):
        pc = close[i - 1]
        tr[i] = max(high[i] - low[i], abs(high[i] - pc), abs(low[i] - pc))
    atr = np.empty(n, dtype=np.float64)
    atr[:] = np.nan
    if n < length:
        return atr
    atr[length - 1] = np.mean(tr[:length])
    for i in range(length, n):
        atr[i] = (atr[i - 1] * (length - 1) + tr[i]) / length
    return atr


def zlema_adj(close: np.ndarray, length: int) -> np.ndarray:
    lag = int(math.floor((length - 1) / 2))
    out = np.empty_like(close, dtype=np.float64)
    for i in range(len(close)):
        if lag > 0 and i >= lag:
            out[i] = close[i] + (close[i] - close[i - lag])
        else:
            out[i] = close[i]
    return out


def bar_since_true(cond_forward: list[bool]) -> int:
    """cond_forward[j] = condition at bar offset j from signal (j=0 signal bar). Pine barssince."""
    for b, c in enumerate(cond_forward):
        if c:
            return b
    return -1


def load_m15(ticker: str | None, period: str = "60d") -> tuple[pd.DataFrame, str]:
    """
    Yahoo often has no 15m rows for XAUUSD=X; COMEX GC=F is a close proxy for gold in USD/oz.
    For MT5-quality XAUUSD, export History to CSV and pass --csv path.
    """
    try:
        import yfinance as yf
    except ImportError:
        print("Install: pip install yfinance pandas numpy", file=sys.stderr)
        raise
    tickers = [ticker] if ticker else ("XAUUSD=X", "XAU=X", "GC=F")
    for t in tickers:
        df = yf.download(t, interval="15m", period=period, progress=False, auto_adjust=False)
        if df is None or len(df) < 300:
            continue
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [str(c[0]) for c in df.columns]
        df.columns = [str(c).capitalize() for c in df.columns]
        print(f"Using Yahoo {t}, rows={len(df)} (15m {period})", file=sys.stderr)
        return df, t
    raise RuntimeError(f"No 15m data for {tickers}. Try --ticker GC=F or --csv your_export.csv")


@dataclass
class TradeResult:
    side: str
    entry_i: int
    exit_i: int
    entry_price: float
    exit_price: float
    pnl: float
    bars_held: int


def run_backtest(
    o: np.ndarray,
    h: np.ndarray,
    l: np.ndarray,
    c: np.ndarray,
    times: pd.DatetimeIndex,
    tp_move: float = TP_MOVE,
) -> tuple[list[TradeResult], dict, dict]:
    n = len(c)
    lag_main = int(math.floor((MAIN_LEN - 1) / 2))
    lag_fast = int(math.floor((FAST_LEN - 1) / 2))
    main_adj = zlema_adj(c, MAIN_LEN)
    fast_adj = zlema_adj(c, FAST_LEN)
    main_line = ema_chronological(main_adj, MAIN_LEN)
    fast_line = ema_chronological(fast_adj, FAST_LEN)
    ema_bias = ema_chronological(c, EMA_BIAS_LEN)
    atr = wilder_atr(h, l, c, ATR_LEN)

    warmup = max(EMA_BIAS_LEN, ATR_LEN) + STRUCTURE_LOOKBACK + 20

    trend_dir = 0
    trend_printed = False
    entry_price = 0.0
    entry_i = -1
    trade_dir = 0
    tp_done = False

    trades: list[TradeResult] = []
    in_pos = False
    pos_side: str | None = None
    pos_entry_i = 0
    pos_entry = 0.0

    signals = 0
    tp_hits = 0

    max_touch_scan = 80
    max_back = max(PULLBACK_WINDOW + 5, 60)

    for i in range(warmup, n):
        if np.isnan(atr[i]) or np.isnan(main_line[i]) or np.isnan(ema_bias[i]):
            continue

        O, H, L, C = o[i], h[i], l[i], c[i]
        if i < 1:
            continue
        C1 = c[i - 1]
        H1 = h[i - 1]
        L1 = l[i - 1]
        main0, main1 = main_line[i], main_line[i - 1]
        fast0, fast1 = fast_line[i], fast_line[i - 1]
        slb = SLOPE_LOOKBACK
        if i < slb:
            continue
        main_slope = main0 - main_line[i - slb]
        fast_slope = fast0 - fast1
        sep = abs(fast0 - main0)
        atrv = atr[i]
        ema_b = ema_bias[i]

        bull_slope_ok = main_slope > atrv * MIN_SLOPE_ATR
        bear_slope_ok = main_slope < -atrv * MIN_SLOPE_ATR
        bull_sep_ok = fast0 > main0 and sep > atrv * MIN_SEP_ATR
        bear_sep_ok = fast0 < main0 and sep > atrv * MIN_SEP_ATR
        bull_bias = C > ema_b
        bear_bias = C < ema_b
        bull_trend = C > main0 and fast0 > main0 and bull_slope_ok
        bear_trend = C < main0 and fast0 < main0 and bear_slope_ok

        body_size = abs(C - O)
        body_strong = body_size > atrv * MIN_BODY_ATR
        range_bar = H - L
        bull_candle = C > O and C >= H - range_bar * 0.35
        bear_candle = C < O and C <= L + range_bar * 0.35
        bull_expansion = C > H1 and bull_candle and body_strong
        bear_expansion = C < L1 and bear_candle and body_strong

        prev_high = h[i - 1]
        prev_low = l[i - 1]
        for k in range(2, STRUCTURE_LOOKBACK + 1):
            prev_high = max(prev_high, h[i - k])
            prev_low = min(prev_low, l[i - k])

        bull_break = C > prev_high or H > prev_high
        bear_break = C < prev_low or L < prev_low

        bull_touch_fwd: list[bool] = []
        bear_touch_fwd: list[bool] = []
        for u in range(min(max_touch_scan, i + 1)):
            idx = i - u
            if idx < 0:
                break
            m, f = main_line[idx], fast_line[idx]
            bull_touch_fwd.append(l[idx] <= f or l[idx] <= m or c[idx] <= f)
            bear_touch_fwd.append(h[idx] >= f or h[idx] >= m or c[idx] >= f)

        bs_bull = bar_since_true(bull_touch_fwd)
        bs_bear = bar_since_true(bear_touch_fwd)
        recent_bull_touch = bs_bull >= 0 and bs_bull <= PULLBACK_WINDOW
        recent_bear_touch = bs_bear >= 0 and bs_bear <= PULLBACK_WINDOW

        co_close_fast = C > fast0 and C1 <= fast1
        cu_close_fast = C < fast0 and C1 >= fast1
        co_fast_main = fast0 > main0 and fast1 <= main1
        cu_fast_main = fast0 < main0 and fast1 >= main1
        bull_reclaim = co_close_fast or (C > fast0 and C1 <= fast1) or co_fast_main
        bear_reject = cu_close_fast or (C < fast0 and C1 >= fast1) or cu_fast_main

        range_now = h[i]
        low5 = l[i]
        for r in range(1, 5):
            if i - r < 0:
                break
            range_now = max(range_now, h[i - r])
            low5 = min(low5, l[i - r])
        not_choppy = (range_now - low5) > atrv * CHOP_THRESH_ATR
        bull_stretch = abs(C - main0) <= atrv * MAX_STRETCH_ATR
        bear_stretch = abs(C - main0) <= atrv * MAX_STRETCH_ATR
        bull_momentum = fast_slope > 0 and C > C1
        bear_momentum = fast_slope < 0 and C < C1

        buy_score = sum(
            [
                bull_trend,
                bull_sep_ok,
                bull_bias,
                bull_expansion,
                bull_break,
                recent_bull_touch and bull_reclaim,
                not_choppy,
                bull_stretch,
                bull_momentum,
            ]
        )
        sell_score = sum(
            [
                bear_trend,
                bear_sep_ok,
                bear_bias,
                bear_expansion,
                bear_break,
                recent_bear_touch and bear_reject,
                not_choppy,
                bear_stretch,
                bear_momentum,
            ]
        )

        impulse_buy = bull_trend and bull_sep_ok and bull_expansion and bull_bias and bull_momentum and not_choppy
        impulse_sell = bear_trend and bear_sep_ok and bear_expansion and bear_bias and bear_momentum and not_choppy
        pullback_buy = (
            bull_trend
            and recent_bull_touch
            and bull_reclaim
            and bull_candle
            and body_strong
            and bull_stretch
            and bull_momentum
            and not_choppy
        )
        pullback_sell = (
            bear_trend
            and recent_bear_touch
            and bear_reject
            and bear_candle
            and body_strong
            and bear_stretch
            and bear_momentum
            and not_choppy
        )
        raw_buy = impulse_buy or pullback_buy or (buy_score >= SCORE_TO_PRINT)
        raw_sell = impulse_sell or pullback_sell or (sell_score >= SCORE_TO_PRINT)

        bull_flip = bull_trend and bull_momentum
        bear_flip = bear_trend and bear_momentum

        td = trend_dir
        if td == 0 and bull_trend:
            td = 1
        if td == 0 and bear_trend:
            td = -1
        new_bull_trend = bull_flip and td != 1
        new_bear_trend = bear_flip and td != -1
        if new_bull_trend:
            td = 1
        elif new_bear_trend:
            td = -1
        trend_dir = td
        if new_bull_trend or new_bear_trend:
            trend_printed = False

        buy_allowed = (trend_dir == 1 or bull_trend) and not trend_printed
        sell_allowed = (trend_dir == -1 or bear_trend) and not trend_printed
        gk_buy = raw_buy and buy_allowed
        gk_sell = raw_sell and sell_allowed
        if gk_buy or gk_sell:
            trend_printed = True

        final_buy = C > main0 and bull_candle and gk_buy
        final_sell = C < main0 and bear_candle and gk_sell

        # --- TP labels (TV) on signal bar after entry
        if final_buy or final_sell:
            entry_price = C
            entry_i = i
            trade_dir = 1 if final_buy else -1
            tp_done = False

        after_entry = entry_i >= 0 and i > entry_i
        buy_tp = after_entry and trade_dir == 1 and (not tp_done) and H >= entry_price + tp_move
        sell_tp = after_entry and trade_dir == -1 and (not tp_done) and L <= entry_price - tp_move
        if buy_tp or sell_tp:
            tp_done = True
            tp_hits += 1

        # --- manage open position (hold until fixed TP; no SL like EA)
        if in_pos:
            exit_here = False
            exit_px = 0.0
            if pos_side == "long" and H >= pos_entry + tp_move:
                exit_here = True
                exit_px = pos_entry + tp_move
            elif pos_side == "short" and L <= pos_entry - tp_move:
                exit_here = True
                exit_px = pos_entry - tp_move
            if exit_here:
                pnl = (exit_px - pos_entry) if pos_side == "long" else (pos_entry - exit_px)
                trades.append(
                    TradeResult(pos_side, pos_entry_i, i, pos_entry, exit_px, pnl, i - pos_entry_i)
                )
                in_pos = False
                pos_side = None

        if final_buy or final_sell:
            signals += 1

        # --- new entry (one position)
        if not in_pos:
            if final_buy:
                in_pos = True
                pos_side = "long"
                pos_entry_i = i
                pos_entry = C
            elif final_sell:
                in_pos = True
                pos_side = "short"
                pos_entry_i = i
                pos_entry = C

    wins = sum(1 for t in trades if t.pnl > 0)
    max_hold = max((t.bars_held for t in trades), default=0)
    summary = {
        "bars": n,
        "signals": signals,
        "tp_labels": tp_hits,
        "closed_trades": len(trades),
        "wins": wins,
        "total_pnl": sum(t.pnl for t in trades),
        "avg_bars": (sum(t.bars_held for t in trades) / len(trades)) if trades else 0.0,
        "max_bars_held": max_hold,
    }
    open_info: dict = {"open": in_pos}
    if in_pos:
        last_i = n - 1
        mtm = (c[last_i] - pos_entry) if pos_side == "long" else (pos_entry - c[last_i])
        open_info.update(
            {
                "side": pos_side,
                "bars_open": int(last_i - pos_entry_i),
                "entry": float(pos_entry),
                "last_close": float(c[last_i]),
                "mtm_vs_entry": float(mtm),
            }
        )
    return trades, summary, open_info


def read_csv_ohlc(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    cols = {c.lower(): c for c in df.columns}
    for need in ("open", "high", "low", "close"):
        if need not in cols:
            raise ValueError(f"CSV needs column {need}; got {list(df.columns)}")
    time_col = None
    for cand in ("time", "datetime", "date"):
        if cand in cols:
            time_col = cols[cand]
            break
    if time_col:
        df[time_col] = pd.to_datetime(df[time_col])
        df = df.set_index(time_col)
    out = pd.DataFrame(
        {
            "Open": df[cols["open"]].astype(float),
            "High": df[cols["high"]].astype(float),
            "Low": df[cols["low"]].astype(float),
            "Close": df[cols["close"]].astype(float),
        }
    )
    return out.sort_index()


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser(description="Backtest GK Sniper logic on 15m bars")
    ap.add_argument("--ticker", default=None, help="Yahoo symbol (default: try XAU then GC=F)")
    ap.add_argument("--period", default="60d", help="yfinance period e.g. 60d, 30d")
    ap.add_argument("--csv", default=None, help="MT5 or other OHLC CSV (Time,Open,High,Low,Close)")
    args = ap.parse_args()

    if args.csv:
        df = read_csv_ohlc(args.csv)
        used = args.csv
    else:
        df, used = load_m15(args.ticker, args.period)

    o = df["Open"].astype(float).values
    h = df["High"].astype(float).values
    l = df["Low"].astype(float).values
    c = df["Close"].astype(float).values
    idx = df.index
    if not isinstance(idx, pd.DatetimeIndex):
        idx = pd.to_datetime(idx)

    trades, summary, open_info = run_backtest(o, h, l, c, idx)
    print("=== GK Sniper-style backtest (15m) ===")
    print(f"Series: {used}")
    print(f"Period: {idx[0]} .. {idx[-1]}")
    for k, v in summary.items():
        print(f"  {k}: {v}")
    if open_info.get("open"):
        print("  OPEN_POSITION:", open_info)
    print(
        "\nNote: EA has no stop-loss; long holds until +TP_MOVE are expected on adverse runs.\n"
        "Official check: MT5 Strategy Tester on XAUUSD M15 with your broker's tick data."
    )
    if trades:
        print("\nLast 10 trades (side, entry_i, exit_i, pnl, bars):")
        for t in trades[-10:]:
            print(f"  {t.side:5} entry_bar={t.entry_i} exit_bar={t.exit_i} pnl={t.pnl:.3f} bars={t.bars_held}")


if __name__ == "__main__":
    main()
