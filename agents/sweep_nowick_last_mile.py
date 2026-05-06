"""Focused IS sweep: MFE trail, confirm-close, SL buffers, TP × time_stop vs promoted baseline.

  python -m agents.sweep_nowick_last_mile --workers 4

Writes reports/nowick_profit_sweep/last_mile/leaderboard.json. If a run beats baseline
(pf * return_pct on IS, with pf>=1.5 and trades>=180), prints the winning patch.
Does not auto-write spec.json — apply manually or use --apply-winner after review.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Tuple

from agents import config
from agents.backtester import run_candidate

SRC_STRATEGY_DIR = Path("strategies/manual/promoted_nowick_ger40_m30_pf154")
SWEEP_ROOT = Path("reports/nowick_profit_sweep/last_mile")


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
        "score": _score(pf, ret, 1.5, 180, trades),
    }


def _build_jobs(base: Dict[str, Any]) -> List[Tuple[str, Dict[str, Any]]]:
    jobs: List[Tuple[str, Dict[str, Any]]] = []

    # A) MFE trail on × (activate, giveback) × break-even pairs
    for act, gb in [(0.40, 0.45), (0.45, 0.50), (0.50, 0.55), (0.38, 0.42)]:
        for be_tr, be_mfe in [(0.35, 0.28), (0.32, 0.26), (0.38, 0.30)]:
            tag = f"trail_a{act}_g{gb}_be{be_tr}_{be_mfe}"
            jobs.append(
                (
                    _safe_tag(tag),
                    {
                        "signal": {
                            "mfe_trail_enabled": True,
                            "mfe_trail_activate_r": act,
                            "mfe_trail_giveback_r": gb,
                            "break_even_trigger_r": be_tr,
                            "break_even_mfe_r": be_mfe,
                        }
                    },
                )
            )

    # B) confirm close beyond level
    jobs.append(
        (
            "confirm-close-true",
            {"signal": {"confirm_close_beyond_level": True}},
        )
    )

    # C) SL buffer grid
    for pts in (2.0, 2.5, 3.0):
        for am in (0.0, 0.05, 0.10):
            tag = f"sl_p{pts}_a{am}"
            jobs.append(
                (
                    _safe_tag(tag),
                    {
                        "signal": {
                            "sl_buffer_points": pts,
                            "sl_buffer_atr_mult": am,
                        }
                    },
                )
            )

    # D) TP × time_stop
    for tp in (3.25, 3.35, 3.4, 3.45):
        for ts in (110, 130, 150):
            tag = f"tp{tp}_ts{ts}"
            jobs.append(
                (
                    _safe_tag(tag),
                    {
                        "signal": {"tp_r_mult": tp},
                        "exit": {"time_stop_bars": ts},
                    },
                )
            )

    return jobs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--config", default=None)
    ap.add_argument(
        "--apply-winner",
        action="store_true",
        help="If best score beats baseline, merge patch into promoted spec.json",
    )
    args = ap.parse_args()

    root = Path(__file__).resolve().parents[1]
    if args.config:
        config.set_overlay(Path(args.config))

    base = json.loads((root / SRC_STRATEGY_DIR / "spec.json").read_text())
    baseline_path = root / Path("reports/promoted_nowick_ger40_m30_tp34/is_summary.json")
    baseline_score = 0.0
    baseline_pf = 0.0
    baseline_ret = 0.0
    if baseline_path.exists():
        s = json.loads(baseline_path.read_text())
        c0 = (s.get("combos") or [{}])[0]
        m = c0.get("metrics") or {}
        baseline_pf = float(m.get("pf", 0))
        baseline_ret = float(m.get("return_pct", 0))
        trades = int(c0.get("trades", 0))
        baseline_score = _score(baseline_pf, baseline_ret, 1.5, 180, trades)
    else:
        print("Warning: no baseline is_summary.json; comparison disabled", file=sys.stderr)

    jobs = _build_jobs(base)
    base_json = json.dumps(base)
    work: List[Tuple[str, str, str, str]] = [
        (str(root), tag, base_json, json.dumps(patch)) for tag, patch in jobs
    ]

    SWEEP_ROOT.mkdir(parents=True, exist_ok=True)
    (SWEEP_ROOT / "runs").mkdir(exist_ok=True)
    (SWEEP_ROOT / "out").mkdir(exist_ok=True)

    results: List[Dict[str, Any]] = []
    with ProcessPoolExecutor(max_workers=max(1, args.workers)) as ex:
        futs = {ex.submit(_one_job, w): w for w in work}
        for fut in as_completed(futs):
            results.append(fut.result())

    results.sort(key=lambda r: float(r.get("score", -1e9)), reverse=True)
    best = results[0] if results else {}

    out_leader = root / SWEEP_ROOT / "leaderboard.json"
    payload = {
        "baseline_file": str(baseline_path.relative_to(root)) if baseline_path.exists() else None,
        "baseline_pf": baseline_pf,
        "baseline_return_pct": baseline_ret,
        "baseline_score": baseline_score,
        "min_trades_gate": 180,
        "min_pf_gate": 1.5,
        "n_runs": len(results),
        "best": best,
        "all": results,
    }
    out_leader.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {out_leader.relative_to(root)}")

    bs = float(best.get("score", -1e9))
    print(f"Baseline score (pf*ret, trades>=180): {baseline_score:.4f}")
    print(f"Best: {best.get('tag')} score={bs:.4f} pf={best.get('pf')} ret={best.get('return_pct')} trades={best.get('trades')}")

    if args.apply_winner and baseline_score > 0 and bs > baseline_score:
        patch = best.get("patch") or {}
        merged = _deep_merge(base, patch)
        spec_path = root / SRC_STRATEGY_DIR / "spec.json"
        spec_path.write_text(json.dumps(merged, indent=2))
        print(f"Applied winner patch to {spec_path.relative_to(root)}")
    elif args.apply_winner:
        print("No apply: best did not beat baseline or baseline missing", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
