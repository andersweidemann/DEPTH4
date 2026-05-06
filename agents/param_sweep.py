"""Random parameter search on a frozen candidate (M15 / single-symbol workflows).

Each trial deep-copies ``spec.json``, applies numeric mutations, writes a temp
candidate dir, runs ``run_candidate`` on the IS window, and logs metrics.

Example recipe (YAML)::

    seed: 42
    trials: 80
    mutations:
      - path: sizing.risk_pct
        kind: uniform
        low: 0.8
        high: 2.8
      - path: signal.tp_r_mult
        kind: choice
        values: [2.0, 2.5, 3.0]

Run::

    python -m agents.param_sweep --dir strategies/manual/no_wick_retest_ger40_m30 \\
        --recipe config/campaigns/examples/param_sweep_recipe.yaml \\
        --out reports/param_sweeps/demo --config config/campaigns/ger40_m15.discovery.yaml

``--config`` is optional; use it to lock the backtest matrix (e.g. GER40 M15 only).
"""
from __future__ import annotations

import argparse
import json
import random
import shutil
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml

from agents import backtester, config


def _set_path(d: dict, dotted: str, value: Any) -> None:
    parts = dotted.split(".")
    cur = d
    for p in parts[:-1]:
        if p not in cur or not isinstance(cur[p], dict):
            cur[p] = {}
        cur = cur[p]
    cur[parts[-1]] = value


def _draw(mut: dict, rng: random.Random) -> Tuple[str, Any]:
    path = mut["path"]
    kind = mut["kind"]
    if kind == "uniform":
        lo, hi = float(mut["low"]), float(mut["high"])
        return path, rng.uniform(lo, hi)
    if kind == "choice":
        vals = mut["values"]
        return path, vals[rng.randint(0, len(vals) - 1)]
    if kind == "randint":
        return path, rng.randint(int(mut["low"]), int(mut["high"]))
    raise ValueError(f"unknown mutation kind: {kind}")


def main() -> int:
    p = argparse.ArgumentParser(description="Random spec mutations + IS backtest")
    p.add_argument("--dir", type=Path, required=True, help="Candidate with spec.json + strategy.py")
    p.add_argument("--recipe", type=Path, required=True, help="YAML with seed, trials, mutations")
    p.add_argument("--out", type=Path, required=True, help="Output directory for trials + summary")
    p.add_argument(
        "--config",
        default=None,
        help="Optional campaign overlay (same as run_loop --config).",
    )
    args = p.parse_args()

    config.set_overlay(args.config.strip() if args.config else None)
    cfg = config.load()

    recipe = yaml.safe_load(args.recipe.read_text(encoding="utf-8"))
    seed = int(recipe.get("seed", 0))
    trials = int(recipe.get("trials", 50))
    mutations: List[dict] = list(recipe.get("mutations") or [])
    if not mutations:
        print("recipe must contain a non-empty mutations list", file=sys.stderr)
        return 1

    rng = random.Random(seed)
    base_spec = json.loads((args.dir / "spec.json").read_text(encoding="utf-8"))

    args.out.mkdir(parents=True, exist_ok=True)
    rows: List[dict] = []
    best: Optional[Tuple[float, int]] = None

    for i in range(trials):
        spec = deepcopy(base_spec)
        trial_dir = args.out / f"trial_{i:04d}"
        if trial_dir.exists():
            shutil.rmtree(trial_dir)
        shutil.copytree(args.dir, trial_dir, dirs_exist_ok=False)

        applied = {}
        for m in mutations:
            path, val = _draw(m, rng)
            _set_path(spec, path, val)
            applied[path] = val

        (trial_dir / "spec.json").write_text(
            json.dumps(spec, indent=2), encoding="utf-8")

        summ = backtester.run_candidate(trial_dir, trial_dir / "bt", label="is")
        combos = summ.get("combos") or []
        if not combos:
            continue
        # Single-combo campaigns: one row. Else average PF.
        pfs = [float(c["metrics"].get("pf", 0)) for c in combos]
        rets = [float(c["metrics"].get("return_pct", 0)) for c in combos]
        trades = sum(int(c.get("trades", 0)) for c in combos)
        avg_pf = sum(pfs) / len(pfs)
        avg_ret = sum(rets) / len(rets)
        row = {
            "trial": i,
            "applied": applied,
            "avg_pf": avg_pf,
            "avg_return_pct": avg_ret,
            "trades_total": trades,
            "combos": len(combos),
        }
        rows.append(row)
        score = avg_pf * 1000 + avg_ret
        if best is None or score > best[0]:
            best = (score, i)

    (args.out / "sweep_results.json").write_text(
        json.dumps({"best_trial_index": best[1] if best is not None else None,
                    "rows": rows}, indent=2, default=float))

    if best is not None:
        print(f"Best trial index: {best[1]} (score={best[0]:.4f})")
    print(f"Wrote {args.out / 'sweep_results.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
