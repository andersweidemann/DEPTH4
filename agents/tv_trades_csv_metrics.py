"""Summarise a TradingView strategy tester \"List of trades\" CSV (export as CSV).

Typical columns include net P&L per closed trade. This script auto-detects the
PnL column and prints trade count, gross win/loss, profit factor, win rate.

Usage (from repo root):
  PYTHONPATH=. python agents/tv_trades_csv_metrics.py path/to/trades.csv
  PYTHONPATH=. python agents/tv_trades_csv_metrics.py path/to/trades.csv --pnl-col "Net P&L EUR"
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def _read_rows(path: Path) -> tuple[List[str], List[Dict[str, str]]]:
    raw = path.read_bytes()
    text = raw.decode("utf-8-sig")
    delim = ";" if text.count(";") > text.count(",") else ","
    lines = text.splitlines()
    if not lines:
        return [], []
    reader = csv.DictReader(lines, delimiter=delim)
    fieldnames = list(reader.fieldnames or [])
    rows = [r for r in reader if any((v or "").strip() for v in r.values())]
    return fieldnames, rows


def _pick_pnl_col(fieldnames: List[str], override: Optional[str]) -> str:
    if override:
        for fn in fieldnames:
            if fn.strip() == override or _norm(fn) == _norm(override):
                return fn
        raise SystemExit(f"--pnl-col {override!r} not found in header: {fieldnames}")

    scored: List[tuple[int, str]] = []
    for fn in fieldnames:
        n = _norm(fn)
        if "cumulative" in n or "cumul" in n:
            continue
        score = 0
        if "net" in n:
            score += 5
        if "p&l" in n or "p/l" in n or "pnl" in n:
            score += 4
        if "profit" in n and "gross" not in n:
            score += 3
        if "profit" in n and "net" in n:
            score += 2
        if n in ("profit", "pnl", "net"):
            score += 2
        if score:
            scored.append((score, fn))
    if not scored:
        raise SystemExit(
            "Could not detect PnL column. Pass --pnl-col with the exact header name.\n"
            f"Columns found: {fieldnames}"
        )
    scored.sort(reverse=True)
    return scored[0][1]


def _rows_for_pnl(fieldnames: List[str], rows: List[Dict[str, str]]) -> tuple[List[Dict[str, str]], str]:
    """TradingView \"List of trades\" duplicates net P&L on Entry and Exit — count Exits only."""
    if "Type" not in fieldnames:
        return rows, "all rows (no Type column)"
    types = {_norm((r.get("Type") or "")) for r in rows}
    has_exit = any(t.startswith("exit") for t in types)
    has_entry = any(t.startswith("entry") for t in types)
    if has_exit and has_entry:
        out = [r for r in rows if _norm((r.get("Type") or "")).startswith("exit")]
        if out:
            return out, "Exit rows only (TV list duplicates P&L on Entry+Exit)"
    return rows, "all rows"


def _parse_money(val: str) -> Optional[float]:
    if val is None:
        return None
    s = val.strip()
    if not s or s == "—" or s == "-":
        return None
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg = True
        s = s[1:-1]
    s = re.sub(r"[^\d,.\-+eE]", "", s.replace(" ", ""))
    if not s or s in "+-":
        return None
    # European: 1.234,56 -> 1234.56
    if s.count(",") == 1 and s.count(".") >= 1:
        s = s.replace(".", "").replace(",", ".")
    elif s.count(",") == 1 and s.count(".") == 0:
        s = s.replace(",", ".")
    else:
        s = s.replace(",", "")
    try:
        x = float(s)
    except ValueError:
        return None
    return -x if neg else x


def main() -> int:
    p = argparse.ArgumentParser(description="Metrics from TradingView trades CSV")
    p.add_argument("csv_path", type=Path)
    p.add_argument("--pnl-col", type=str, default=None, help="Exact header for per-trade net P&L")
    args = p.parse_args()

    path = args.csv_path.expanduser().resolve()
    if not path.is_file():
        print(f"Not a file: {path}", file=sys.stderr)
        return 1

    fieldnames, rows = _read_rows(path)
    if not rows:
        print("No data rows.", file=sys.stderr)
        return 1

    pnl_col = _pick_pnl_col(fieldnames, args.pnl_col)
    pnl_rows, row_note = _rows_for_pnl(fieldnames, rows)
    pnls: List[float] = []
    skipped = 0
    for r in pnl_rows:
        v = _parse_money(r.get(pnl_col, "") or "")
        if v is None:
            skipped += 1
            continue
        pnls.append(v)

    if not pnls:
        print(f"No numeric P&L values in column {pnl_col!r} (skipped {skipped} rows).", file=sys.stderr)
        return 1

    wins = sum(x for x in pnls if x > 0)
    losses = sum(x for x in pnls if x < 0)
    n = len(pnls)
    n_win = sum(1 for x in pnls if x > 0)
    gross_loss = abs(losses)
    pf = (wins / gross_loss) if gross_loss > 0 else float("inf")
    total = wins + losses
    win_rate = 100.0 * n_win / n if n else 0.0

    print(f"File: {path}")
    print(f"Detected P&L column: {pnl_col!r}")
    print(f"Row selection: {row_note}")
    print(f"Closed trades (rows with P&L): {n}  (skipped rows: {skipped})")
    print(f"Gross profit (sum wins): {wins:.4f}")
    print(f"Gross loss (sum losses, negative as cash): {losses:.4f}")
    print(f"Net P&L: {total:.4f}")
    print(f"Profit factor (gross win / gross loss): {pf:.4f}" if gross_loss > 0 else "PF: inf (no losing trades)")
    print(f"Win rate: {win_rate:.2f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
