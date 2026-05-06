"""Backtest IS matrix for profit-upgrade toggles (scale-out, regime TP, asymmetric L/S).

  python -m agents.sweep_profit_upgrade_toggles --workers 4

Reads strategies/manual/promoted_nowick_ger40_m30_pf154 (strategy.py + spec patches).
Writes reports/profit_upgrade_toggle_sweep/leaderboard.json
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

SRC = Path("strategies/manual/promoted_nowick_ger40_m30_pf154")
OUT_ROOT = Path("reports/profit_upgrade_toggle_sweep")


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

    src = root / SRC
    run_dir = root / OUT_ROOT / "runs" / tag
    out_dir = root / OUT_ROOT / "out" / tag
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
        "pf": pf,
        "return_pct": ret,
        "trades": trades,
        "max_dd_pct": float(m.get("max_dd_pct", 0.0)),
        "sharpe": float(m.get("sharpe", 0.0)),
        "score": _score(pf, ret, 1.5, 180, trades),
    }


def _jobs() -> List[Tuple[str, Dict[str, Any]]]:
    asym = {
        "enabled": True,
        "long": {"tp_r_mult": 3.45, "sl_buffer_points": 3.0},
        "short": {"tp_r_mult": 3.2, "sl_buffer_points": 2.75, "block_entry_hours_local": [0, 1, 6, 7]},
    }
    scale = {"signal": {"scale_out_enabled": True}}
    scale_tr = {
        "signal": {
            "scale_out_enabled": True,
            "scale_out_runner_trail_enabled": True,
            "scale_out_trail_activate_r": 0.48,
            "scale_out_trail_giveback_r": 0.42,
        }
    }
    reg = {
        "signal": {
            "regime_tp_enabled": True,
            "regime_tp_atr_pct_threshold": 70.0,
            "tp_r_mult_quiet": 2.85,
            "tp_r_mult_volatile": 3.55,
        }
    }
    asym_patch = {"signal": {"asymmetric_ls": asym}}

    return [
        ("baseline", {}),
        ("scale-50pct-at-2R", scale),
        ("scale-plus-runner-trail", scale_tr),
        ("regime-tp-quiet-volatile", reg),
        ("asymmetric-ls", asym_patch),
        ("scale-plus-regime", _deep_merge(scale, reg)),
        ("scale-plus-asym", _deep_merge(scale, asym_patch)),
        ("regime-plus-asym", _deep_merge(reg, asym_patch)),
        ("all-three", _deep_merge(_deep_merge(scale_tr, reg), asym_patch)),
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--config", default=None)
    args = ap.parse_args()
    root = Path(__file__).resolve().parents[1]
    if args.config:
        config.set_overlay(Path(args.config))

    base = json.loads((root / SRC / "spec.json").read_text())
    base_json = json.dumps(base)
    work: List[Tuple[str, str, str, str]] = []
    for tag, patch in _jobs():
        work.append((str(root), _safe_tag(tag), base_json, json.dumps(patch)))

    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    (OUT_ROOT / "runs").mkdir(exist_ok=True)
    (OUT_ROOT / "out").mkdir(exist_ok=True)

    results: List[Dict[str, Any]] = []
    with ProcessPoolExecutor(max_workers=max(1, args.workers)) as ex:
        futs = {ex.submit(_one_job, w): w for w in work}
        for fut in as_completed(futs):
            results.append(fut.result())

    results.sort(key=lambda r: float(r.get("score", -1e9)), reverse=True)
    out_path = root / OUT_ROOT / "leaderboard.json"
    out_path.write_text(json.dumps({"best": results[0], "all": results}, indent=2))
    print(f"Wrote {out_path.relative_to(root)}")
    for r in results:
        print(
            f"  {r.get('tag')}: score={r.get('score'):.3f} pf={r.get('pf'):.3f} "
            f"ret={r.get('return_pct'):.2f}% trades={r.get('trades')}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
