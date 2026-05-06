"""Parallel IS sweep for promoted no-wick GER40 strategy (session / time_stop / TP / toggles).

  python -m agents.sweep_nowick_profit --workers 4
  python -m agents.sweep_nowick_profit --workers 4 --quick
  python -m agents.sweep_nowick_profit --workers 4 --include-timeframes M15,H1

Ranking: among runs with pf >= --min-pf and trades >= --min-trades, sort by (pf * return_pct)
descending (gross-profitability proxy on the same IS window).

Writes reports/nowick_profit_sweep/leaderboard.json and per-run summaries.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from agents import config
from agents.backtester import run_candidate

SRC_STRATEGY_DIR = Path("strategies/manual/promoted_nowick_ger40_m30_pf154")
SWEEP_ROOT = Path("reports/nowick_profit_sweep")


def _deep_merge(base: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    out = deepcopy(base)
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            _deep_merge_inplace(out[k], v)
        else:
            out[k] = deepcopy(v)
    return out


def _deep_merge_inplace(dst: Dict[str, Any], patch: Dict[str, Any]) -> None:
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            _deep_merge_inplace(dst[k], v)
        else:
            dst[k] = deepcopy(v)


def _score(pf: float, ret: float, min_pf: float, min_trades: int, trades: int) -> float:
    if trades < min_trades or pf < min_pf:
        return -1e9
    return pf * ret


def _safe_tag(s: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in s)


def _one_job(args: Tuple[str, str, str, str]) -> Dict[str, Any]:
    """Pickle-friendly worker: (repo_root_str, tag, base_json, patch_json)."""
    root_s, tag, base_json, patch_json = args
    root = Path(root_s)
    base = json.loads(base_json)
    patch = json.loads(patch_json)
    spec = _deep_merge(base, patch)

    src = root / SRC_STRATEGY_DIR
    run_dir = root / SWEEP_ROOT / "runs" / tag
    out_dir = root / SWEEP_ROOT / "out" / tag
    if run_dir.exists():
        shutil.rmtree(run_dir)
    shutil.copytree(src, run_dir)
    (run_dir / "spec.json").write_text(json.dumps(spec, indent=2))

    config.set_overlay(None)
    syms = list(spec.get("symbols") or ["GER40"])
    tfs = list(spec.get("timeframes") or ["M30"])
    summary = run_candidate(run_dir, out_dir, symbols=syms, timeframes=tfs, label="is")
    combos = summary.get("combos") or []
    if not combos:
        return {"tag": tag, "patch": patch, "error": "no_combos", "score": -1e9}
    c0 = combos[0]
    m = c0.get("metrics") or {}
    pf = float(m.get("pf", 0.0))
    ret = float(m.get("return_pct", 0.0))
    trades = int(c0.get("trades", 0))
    return {
        "tag": tag,
        "patch": patch,
        "symbol": c0.get("symbol"),
        "timeframe": c0.get("timeframe"),
        "pf": pf,
        "return_pct": ret,
        "trades": trades,
        "max_dd_pct": float(m.get("max_dd_pct", 0.0)),
        "sharpe": float(m.get("sharpe", 0.0)),
        "score": _score(pf, ret, 1.5, 40, trades),
    }


def _build_base_spec(root: Path) -> Dict[str, Any]:
    p = root / SRC_STRATEGY_DIR / "spec.json"
    return json.loads(p.read_text())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument(
        "--include-timeframes",
        default="",
        help="Comma-separated extra TFs to sweep (e.g. M15,H1). Each becomes a full spec variant.",
    )
    ap.add_argument("--min-pf", type=float, default=1.5)
    ap.add_argument("--min-trades", type=int, default=40)
    ap.add_argument("--config", default=None)
    ap.add_argument(
        "--quick",
        action="store_true",
        help="Smaller grid (faster): fewer sessions, TP points, and skips some toggle blocks.",
    )
    args = ap.parse_args()

    config.set_overlay(args.config.strip() if args.config else None)
    root = config.repo_root()
    base = _build_base_spec(root)

    extra_tfs = [x.strip().upper() for x in args.include_timeframes.split(",") if x.strip()]

    jobs: List[Tuple[str, str, str, str]] = []
    tag_i = 0

    def add_job(patch: Dict[str, Any], label: str) -> None:
        nonlocal tag_i
        raw = f"{tag_i:04d}_{label}"
        tag = _safe_tag(raw)[:120]
        tag_i += 1
        jobs.append(
            (str(root), tag, json.dumps(base, separators=(",", ":")), json.dumps(patch, separators=(",", ":"))),
        )

    # --- Session + wall-clock (Berlin) ---
    if args.quick:
        sessions = [
            ("09:30", "18:00"),
            ("09:00", "18:30"),
            ("09:30", "20:00"),
        ]
        time_stops = [110, 130, 170]
        tp_grid = [2.95, 3.05, 3.2]
        max_waits = [44, 48, 52]
        mtds = [6]
        trend_sources = ["h1", "or"]
        be_pairs = [(0.35, 0.28)]
        cooldowns = [4]
        block_variants = [[0, 1, 6]]
        pullback_m = [0.35]
    else:
        sessions = [
            ("09:30", "18:00"),
            ("09:00", "18:30"),
            ("08:30", "18:00"),
            ("09:30", "20:00"),
            ("10:00", "17:30"),
            ("09:30", "16:30"),
            ("08:00", "19:00"),
        ]
        time_stops = [96, 110, 130, 150, 170, 200]
        tp_grid = [2.88, 2.92, 2.95, 2.98, 3.02, 3.06, 3.10]
        max_waits = [40, 44, 48, 52, 56]
        mtds = [4, 6, 8]
        trend_sources = ["h1", "m30", "and", "or"]
        be_pairs = [
            (0.35, 0.28),
            (0.40, 0.30),
            (0.30, 0.25),
        ]
        cooldowns = [0, 2, 4, 6]
        block_variants = [
            [0, 1, 6],
            [0, 1, 6, 7],
            [0, 6],
            None,
        ]
        pullback_m = [0.25, 0.35, 0.45]

    # Stage 1: coarse session × time_stop (baseline signal)
    for st, en in sessions:
        for ts in time_stops:
            add_job(
                {
                    "filters": {"session_local": {"timezone": "Europe/Berlin", "start": st, "end": en}},
                    "exit": {"time_stop_bars": ts},
                },
                f"s{st}-{en}_ts{ts}",
            )

    # Stage 2: TP × max_wait on default session
    for tp in tp_grid:
        for mw in max_waits:
            add_job({"signal": {"tp_r_mult": tp, "max_wait_bars": mw}}, f"tp{tp}_mw{mw}")

    # Stage 3: risk / trades-per-day / trend filter / BE / cooldown / blocks / pullback
    for mtd in mtds:
        add_job({"signal": {"max_trades_per_day": mtd}}, f"mtd{mtd}")
    for src in trend_sources:
        add_job({"signal": {"trend_source": src}}, f"trend_{src}")
    for trig, mfe in be_pairs:
        tlabel = str(trig).replace(".", "p") + "_" + str(mfe).replace(".", "p")
        add_job({"signal": {"break_even_trigger_r": trig, "break_even_mfe_r": mfe}}, f"be_{tlabel}")
    for cd in cooldowns:
        add_job({"signal": {"cooldown_bars_after_loss": cd}}, f"cd{cd}")
    for blk in block_variants:
        if blk is None:
            add_job({"signal": {"block_entry_hours_local": []}}, "blk_none")
        else:
            add_job({"signal": {"block_entry_hours_local": blk}}, f"blk{len(blk)}")
    for pb in pullback_m:
        pbs = str(pb).replace(".", "p")
        add_job({"signal": {"min_pullback_atr_mult": pb}}, f"pb{pbs}")

    # Vol filter toggles
    add_job({"signal": {"vol_filter_enabled": False}}, "vol_off")
    add_job({"signal": {"atr_percentile_min": 0.0, "atr_percentile_max": 100.0}}, "vol_wide")

    # Timeframes (optional): same logic on different bar speed
    for tf in extra_tfs:
        add_job({"timeframes": [tf]}, f"tf_{tf}")

    root_s = str(root)
    results: List[Dict[str, Any]] = []
    n_workers = max(1, int(args.workers))
    with ProcessPoolExecutor(max_workers=n_workers) as ex:
        futs = {ex.submit(_one_job, j): j for j in jobs}
        for fut in as_completed(futs):
            try:
                results.append(fut.result())
            except Exception as e:
                results.append({"error": str(e), "score": -1e9})

    valid = [r for r in results if r.get("score", -1e8) > -1e8 + 1]
    valid.sort(key=lambda r: (r.get("score", 0.0), r.get("pf", 0.0), r.get("return_pct", 0.0)), reverse=True)

    out_root = root / SWEEP_ROOT
    out_root.mkdir(parents=True, exist_ok=True)
    board = {
        "min_pf": args.min_pf,
        "min_trades": args.min_trades,
        "n_jobs": len(jobs),
        "n_ok": len(valid),
        "top": valid[:25],
        "baseline_metrics": None,
    }
    (out_root / "leaderboard.json").write_text(json.dumps(board, indent=2, default=float))

    # Best spec JSON for manual promotion
    if valid:
        best = valid[0]
        best_spec = _deep_merge(base, best["patch"])
        (out_root / "best_spec.json").write_text(json.dumps(best_spec, indent=2))
        print(json.dumps({"best": best, "written": str(out_root / "best_spec.json")}, indent=2, default=float))
    else:
        print(json.dumps({"warning": "no_valid_runs", "sample": results[:5]}, indent=2, default=float))
    return 0


if __name__ == "__main__":
    sys.exit(main())
