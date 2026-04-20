"""
Historical OHLCV loader and exporter.

Sources (in priority order from config.yaml):
  1. `mt5`       - MetaTrader5 Python package (VPS only).
  2. `dukascopy` - dukascopy-python if installed (Mac-friendly fallback).
  3. `demo`     - synthetic random-walk data for smoke-testing.

All data is cached to parquet under data/<SYMBOL>/<TF>/<YYYY>.parquet. M5/M15
are aggregated from M1 at read time when only M1 is cached.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import config


_TF_MINUTES = {"M1": 1, "M5": 5, "M15": 15, "M30": 30, "H1": 60, "H4": 240, "D1": 1440}


def _data_root() -> Path:
    root = config.repo_root() / config.load()["data"]["root"]
    root.mkdir(parents=True, exist_ok=True)
    return root


def _cache_file(symbol: str, tf: str) -> Path:
    p = _data_root() / symbol.upper() / tf.upper()
    p.mkdir(parents=True, exist_ok=True)
    return p / "ohlcv.parquet"


def _aggregate(m1: pd.DataFrame, tf: str) -> pd.DataFrame:
    minutes = _TF_MINUTES[tf.upper()]
    if minutes == 1:
        return m1
    rule = f"{minutes}min"
    agg = m1.resample(rule, label="left", closed="left").agg({
        "open": "first", "high": "max", "low": "min", "close": "last",
        "volume": "sum" if "volume" in m1.columns else "first",
    }).dropna(subset=["open", "high", "low", "close"])
    return agg


def load_ohlcv(symbol: str, tf: str, start: str, end: str) -> pd.DataFrame:
    m1_path = _cache_file(symbol, "M1")
    tf_path = _cache_file(symbol, tf)

    if tf_path.exists():
        df = pd.read_parquet(tf_path)
    elif m1_path.exists():
        m1 = pd.read_parquet(m1_path)
        df = _aggregate(m1, tf)
        df.to_parquet(tf_path)
    else:
        raise FileNotFoundError(
            f"No cached data for {symbol} (looked for {tf_path} or {m1_path}). "
            f"Run `python -m agents.data_fetch --symbol {symbol} --tf M1 "
            f"--from {start} --to {end}` first."
        )

    if not isinstance(df.index, pd.DatetimeIndex):
        if "time" in df.columns:
            df["time"] = pd.to_datetime(df["time"])
            df = df.set_index("time")
        else:
            raise ValueError(f"{tf_path}: no DatetimeIndex and no 'time' column")

    df.index = pd.DatetimeIndex(df.index)
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    else:
        df.index = df.index.tz_convert("UTC")

    df = df.sort_index()
    start_ts = pd.Timestamp(start, tz="UTC")
    end_ts = (pd.Timestamp.now(tz="UTC") if end == "today" else pd.Timestamp(end, tz="UTC"))
    return df.loc[start_ts:end_ts].copy()


# ---------------------------------------------------------------------------
# Fetchers
# ---------------------------------------------------------------------------

def fetch_mt5(symbol: str, tf: str, start: str, end: str) -> pd.DataFrame:
    try:
        import MetaTrader5 as mt5  # type: ignore
    except ImportError as e:
        raise RuntimeError("MetaTrader5 package not installed (VPS-only).") from e

    tf_map = {
        "M1": mt5.TIMEFRAME_M1, "M5": mt5.TIMEFRAME_M5,
        "M15": mt5.TIMEFRAME_M15, "M30": mt5.TIMEFRAME_M30,
        "H1": mt5.TIMEFRAME_H1, "H4": mt5.TIMEFRAME_H4, "D1": mt5.TIMEFRAME_D1,
    }
    if not mt5.initialize():
        raise RuntimeError(f"mt5.initialize failed: {mt5.last_error()}")
    try:
        s = pd.Timestamp(start)
        e = pd.Timestamp.now(tz="UTC").tz_localize(None) if end == "today" else pd.Timestamp(end)
        rates = mt5.copy_rates_range(symbol, tf_map[tf.upper()], s.to_pydatetime(),
                                     e.to_pydatetime())
        if rates is None or len(rates) == 0:
            raise RuntimeError(f"mt5.copy_rates_range returned empty for {symbol} {tf}")
        df = pd.DataFrame(rates)
        df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
        df = df.set_index("time").rename(columns={"tick_volume": "volume"})
        return df[["open", "high", "low", "close", "volume"]]
    finally:
        mt5.shutdown()


# Instrument-code map for Dukascopy. Broker-side names differ from our internal
# ones. Add more as needed; values must match dukascopy-python's `instrument`
# strings exactly.
_DUKA_INSTRUMENT = {
    "XAUUSD": "XAU/USD",
    "GER40":  "DEU.IDX/EUR",   # DAX40 cash index, EUR-quoted
}

_DUKA_INTERVAL = {
    "M1":  "INTERVAL_MIN_1",
    "M5":  "INTERVAL_MIN_5",
    "M15": "INTERVAL_MIN_15",
    "M30": "INTERVAL_MIN_30",
    "H1":  "INTERVAL_HOUR_1",
    "H4":  "INTERVAL_HOUR_4",
    "D1":  "INTERVAL_DAY_1",
}


def fetch_dukascopy(symbol: str, tf: str, start: str, end: str) -> pd.DataFrame:
    """Fetch OHLCV from Dukascopy via `dukascopy-python`.

    Returns a UTC-indexed DataFrame with columns open/high/low/close/volume.
    Chunks requests by year to keep memory bounded and make progress visible;
    dukascopy-python handles retries and its own pagination within each chunk.
    """
    try:
        import dukascopy_python as d  # type: ignore
    except ImportError as e:
        raise RuntimeError(
            "dukascopy-python not installed. `pip install dukascopy-python` "
            "or use `--source mt5` on VPS / `--source demo` for a smoke test.") from e

    sym = symbol.upper()
    tf_u = tf.upper()
    if sym not in _DUKA_INSTRUMENT:
        raise ValueError(
            f"Dukascopy instrument code for '{sym}' not mapped. "
            f"Add it to _DUKA_INSTRUMENT in agents/data_fetch.py.")
    if tf_u not in _DUKA_INTERVAL:
        raise ValueError(f"Dukascopy interval for '{tf_u}' not mapped")

    instrument = _DUKA_INSTRUMENT[sym]
    interval = getattr(d, _DUKA_INTERVAL[tf_u])

    start_ts = pd.Timestamp(start, tz="UTC")
    end_ts = (pd.Timestamp.now(tz="UTC") if end == "today"
              else pd.Timestamp(end, tz="UTC"))

    # Yearly chunks: keeps progress observable and avoids one giant in-memory
    # concat. Dukascopy itself delivers daily binary files under the hood.
    chunks: list[pd.DataFrame] = []
    cursor = start_ts
    while cursor < end_ts:
        chunk_end = min(cursor + pd.DateOffset(years=1), end_ts)
        print(f"[dukascopy] {sym} {tf_u}: "
              f"{cursor.date()} -> {chunk_end.date()}", flush=True)
        df_chunk = d.fetch(
            instrument=instrument,
            interval=interval,
            offer_side=d.OFFER_SIDE_BID,
            start=cursor.to_pydatetime(),
            end=chunk_end.to_pydatetime(),
        )
        if df_chunk is not None and len(df_chunk) > 0:
            chunks.append(df_chunk)
        cursor = chunk_end

    if not chunks:
        raise RuntimeError(f"Dukascopy returned no data for {sym} {tf_u} "
                           f"{start} .. {end}")

    df = pd.concat(chunks)
    df = df[~df.index.duplicated(keep="first")].sort_index()
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    else:
        df.index = df.index.tz_convert("UTC")
    df.index.name = "time"
    cols = [c for c in ("open", "high", "low", "close", "volume") if c in df.columns]
    return df[cols]


def fetch_demo(symbol: str, tf: str, start: str, end: str,
               seed: int = 42) -> pd.DataFrame:
    """Synthetic geometric random walk. Enough to exercise the pipeline end-to-end.
    NOT suitable for judging strategy quality - use real data before trusting anything.
    """
    rng = np.random.default_rng(seed ^ hash(symbol) & 0xFFFF)
    minutes = _TF_MINUTES["M1"]
    start_ts = pd.Timestamp(start, tz="UTC")
    end_ts = (pd.Timestamp.now(tz="UTC") if end == "today" else pd.Timestamp(end, tz="UTC"))
    idx = pd.date_range(start_ts, end_ts, freq=f"{minutes}min", tz="UTC")
    n = len(idx)
    if n == 0:
        raise ValueError("Empty date range")
    mu = 0.0
    sigma = 0.0005 if symbol.upper() == "XAUUSD" else 0.0003
    returns = rng.normal(mu, sigma, n)
    base = 1900.0 if symbol.upper() == "XAUUSD" else 16_000.0
    close = base * np.exp(np.cumsum(returns))
    high = close * (1 + np.abs(rng.normal(0, sigma / 2, n)))
    low = close * (1 - np.abs(rng.normal(0, sigma / 2, n)))
    open_ = np.roll(close, 1)
    open_[0] = close[0]
    volume = rng.integers(1, 1000, n)
    df = pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": volume},
        index=idx,
    )
    df.index.name = "time"
    return df


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def cli() -> int:
    p = argparse.ArgumentParser(description="Fetch/export OHLCV for the factory")
    p.add_argument("--symbol", required=True)
    p.add_argument("--tf", default="M1")
    p.add_argument("--from", dest="start", default="2020-01-01")
    p.add_argument("--to", dest="end", default="today")
    p.add_argument("--source", default=None,
                   choices=("mt5", "dukascopy", "demo"),
                   help="Default: try sources in order from config.yaml")
    args = p.parse_args()

    cfg = config.load()
    sources = [args.source] if args.source else cfg["data"]["source_priority"]
    last_err: Optional[Exception] = None
    df: Optional[pd.DataFrame] = None
    for src in sources:
        try:
            if src == "mt5":
                df = fetch_mt5(args.symbol, args.tf, args.start, args.end)
            elif src == "dukascopy":
                df = fetch_dukascopy(args.symbol, args.tf, args.start, args.end)
            elif src == "demo":
                df = fetch_demo(args.symbol, args.tf, args.start, args.end)
            if df is not None and len(df) > 0:
                print(f"[{src}] fetched {len(df)} rows")
                break
        except Exception as e:  # noqa: BLE001
            last_err = e
            print(f"[{src}] failed: {e}")
            df = None
    if df is None:
        raise SystemExit(f"All sources failed. last error: {last_err}")

    out = _cache_file(args.symbol, args.tf)
    df.to_parquet(out)
    print(f"wrote {out} ({len(df)} rows)")
    return 0


if __name__ == "__main__":
    sys.exit(cli())
