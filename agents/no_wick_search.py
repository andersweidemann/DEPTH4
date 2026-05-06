"""Random + local search for no_wick_retest_ger40_m30 against PF / CAGR targets.

Targets (IS window from ``config.yaml``):
  - Profit factor > 1.5
  - Compound annual growth rate (CAGR) > 10% from total Return [%]

Usage:
  PYTHONPATH=. python agents/no_wick_search.py
  PYTHONPATH=. python agents/no_wick_search.py --n 200 --seed 1

Writes ``reports/no_wick_search/summary.json`` and ``winner_spec.json``;
copies winner into ``strategies/manual/no_wick_retest_ger40_m30/spec.json`` if
targets are met, else copies best-scoring candidate anyway.
"""
from __future__ import annotations

import argparse
import copy
import json
import random
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pandas as pd

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from agents import config  # noqa: E402
from agents.backtester import run_candidate  # noqa: E402

STRAT_DIR = REPO / "strategies/manual/no_wick_retest_ger40_m30"
OUT = REPO / "reports/no_wick_search"


def deep_merge(a: dict, b: dict) -> dict:
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            deep_merge(a[k], v)
        else:
            a[k] = v
    return a


def window_years(is_start: str, is_end: str) -> float:
    t0 = pd.Timestamp(is_start)
    t1 = pd.Timestamp(is_end)
    days = max(1, (t1 - t0).days)
    return float(days) / 365.25


def cagr_from_return_pct(ret_pct: float, years: float) -> float:
    if years <= 0:
        return float("-inf")
    return float(((1.0 + ret_pct / 100.0) ** (1.0 / years) - 1.0) * 100.0)


def meets_targets(m: dict, years: float) -> bool:
    pf = float(m.get("pf", 0.0))
    ret = float(m.get("return_pct", 0.0))
    tr = int(m.get("trades", 0))
    cg = cagr_from_return_pct(ret, years)
    return pf > 1.5 and cg > 10.0 and tr >= 50


def objective(m: dict, years: float) -> float:
    """Single score: valid combos dominate; else prefer PF≥1.5 then CAGR/return."""
    pf = float(m.get("pf", 0.0))
    ret = float(m.get("return_pct", 0.0))
    tr = int(m.get("trades", 0))
    cg = cagr_from_return_pct(ret, years)
    if pf > 1.5 and cg > 10.0 and tr >= 50:
        return 1e9 + ret + 0.01 * pf
    if pf >= 1.5:
        return 5e8 + cg * 120.0 + ret * 0.45 + min(tr / 220.0, 1.5) * 6.0
    if pf >= 1.38:
        return 2e4 + pf * 220.0 + cg * 50.0 + ret * 0.22 + min(tr / 220.0, 1.5) * 5.0
    return (
        min(pf / 1.38, 1.15) * 900.0
        + max(cg, 0.0) * 38.0
        + max(ret, 0.0) * 0.16
        + min(tr / 220.0, 1.5) * 3.5
    )


def random_patch(rng: random.Random) -> Dict[str, Any]:
    """Build a nested patch dict for one trial."""
    vol_on = rng.random() < 0.78
    patch: Dict[str, Any] = {
        "signal": {
            "trend_source": rng.choices(
                ["and", "h1", "m30", "or"],
                weights=[4, 4, 2, 1],
                k=1,
            )[0],
            "tp_r_mult": rng.choice([1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75]),
            "sl_buffer_points": rng.choice([0.8, 1.0, 1.5, 2.0, 2.5]),
            "min_pullback_atr_mult": rng.choice([0.0, 0.1, 0.2, 0.25, 0.35, 0.45]),
            "break_even_enabled": rng.random() < 0.82,
            "break_even_trigger_r": rng.choice([0.22, 0.28, 0.35, 0.42, 0.5]),
            "break_even_mfe_r": rng.choice([0.0, 0.22, 0.28, 0.35, 0.42, 0.5]),
            "mfe_trail_enabled": rng.choice([False, False, True]),
            "mfe_trail_activate_r": rng.choice([0.45, 0.5, 0.55, 0.62]),
            "mfe_trail_giveback_r": rng.choice([0.5, 0.58, 0.65, 0.72]),
            "vol_filter_enabled": vol_on,
            "atr_percentile_min": rng.choice([0.0, 5.0, 10.0, 15.0, 20.0, 25.0]),
            "atr_percentile_max": rng.choice([88.0, 92.0, 95.0, 98.0, 99.5]),
            "max_trades_per_day": rng.choice([0, 0, 3, 4, 5, 6, 8]),
            "cooldown_bars_after_loss": rng.choice([0, 0, 4, 6, 8, 10, 12]),
            "block_entry_hours_local": rng.choice(
                [[], [], [0, 1], [10, 11], [0, 1, 6], [23, 0, 1]],
            ),
            "min_bars_before_mfe_management": rng.choice([0, 0, 1, 2, 3, 4]),
            "confirm_close_beyond_level": rng.choice([False, False, True]),
        },
        "exit": {
            "time_stop_bars": rng.choice([45, 55, 65, 75, 85, 95, 110, 130]),
        },
        "sizing": {
            # Primary lever for absolute % return (same edge, larger R per trade).
            "risk_pct": float(
                rng.choices(
                    [0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 1.0, 1.15, 1.35, 1.6, 1.9, 2.2, 2.6, 3.0, 3.5, 4.0],
                    weights=[1, 1, 2, 2, 3, 2, 3, 2, 2, 2, 2, 2, 2, 2, 1, 1],
                    k=1,
                )[0]
            ),
        },
    }
    if not vol_on:
        patch["signal"]["atr_percentile_min"] = 0.0
        patch["signal"]["atr_percentile_max"] = 100.0

    # Regime ADX (optional)
    roll = rng.random()
    if roll < 0.55:
        patch["regime_filter"] = None
    elif roll < 0.82:
        patch["regime_filter"] = {
            "indicator": "adx",
            "period": int(rng.choice([10, 14, 18])),
            "min": float(rng.choice([12, 15, 18, 20, 22, 25])),
            "max": float(rng.choice([45, 50, 55, 60, 70, 80])),
        }
    else:
        patch["regime_filter"] = {
            "indicator": "adx",
            "period": 14,
            "min": float(rng.choice([22, 25, 28, 30])),
            "max": float(rng.choice([40, 45, 50])),
        }
    return patch


def polish_risk_pct(
    base_spec: dict,
    years: float,
    out_root: Path,
    risk_values: List[float],
    start_id: int = 50_000,
) -> Tuple[Optional[dict], Optional[dict], Optional[dict]]:
    """Scale sizing.risk_pct holding other knobs fixed (fast line search)."""
    best_obj = -1e18
    best_row: Optional[dict] = None
    best_spec: Optional[dict] = None
    for k, rp in enumerate(risk_values):
        spec = copy.deepcopy(base_spec)
        spec.setdefault("sizing", {})["risk_pct"] = float(rp)
        row, full = run_trial(start_id + k, spec, out_root)
        cg = cagr_from_return_pct(row["return_pct"], years)
        row["cagr_pct"] = cg
        row["targets_ok"] = meets_targets(
            {"pf": row["pf"], "return_pct": row["return_pct"], "trades": row["trades"]},
            years,
        )
        obj = objective(
            {"pf": row["pf"], "return_pct": row["return_pct"], "trades": row["trades"]},
            years,
        )
        if obj > best_obj:
            best_obj = obj
            best_row = row
            best_spec = full
    return best_row, best_spec, {"best_obj": best_obj}


def run_trial(
    trial_id: int,
    spec: dict,
    out_root: Path,
) -> Tuple[dict, dict]:
    cand = out_root / "trials" / f"t{trial_id:05d}"
    cand.mkdir(parents=True, exist_ok=True)
    shutil.copy2(STRAT_DIR / "strategy.py", cand / "strategy.py")
    (cand / "spec.json").write_text(json.dumps(spec, indent=2))
    bt_out = out_root / "bt" / f"t{trial_id:05d}"
    if bt_out.exists():
        shutil.rmtree(bt_out)
    summ = run_candidate(cand, bt_out, label="is")
    m = summ["combos"][0]["metrics"]
    row = {
        "trial": trial_id,
        "trades": int(m.get("trades", 0)),
        "return_pct": float(m.get("return_pct", 0.0)),
        "pf": float(m.get("pf", 0.0)),
        "sharpe": float(m.get("sharpe", 0.0)),
        "max_dd_pct": float(m.get("max_dd_pct", 0.0)),
    }
    return row, spec


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--n", type=int, default=320, help="Random trials")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--no-write-spec", action="store_true")
    args = p.parse_args()

    config.set_overlay(None)
    config.clear_load_cache()
    cfg = config.load()
    w = cfg["windows"]
    years = window_years(str(w["is_start"]), str(w["is_end"]))

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "trials").mkdir(exist_ok=True)
    (OUT / "bt").mkdir(exist_ok=True)

    base = json.loads((STRAT_DIR / "spec.json").read_text())
    rng = random.Random(args.seed)

    rows: List[dict] = []
    best_obj = -1e18
    best: Tuple[float, dict, dict] = (-1e18, {}, {})

    for t in range(args.n):
        spec = copy.deepcopy(base)
        deep_merge(spec, random_patch(rng))
        row, full = run_trial(t, spec, OUT)
        cg = cagr_from_return_pct(row["return_pct"], years)
        row["cagr_pct"] = cg
        row["targets_ok"] = meets_targets(
            {"pf": row["pf"], "return_pct": row["return_pct"], "trades": row["trades"]},
            years,
        )
        rows.append({**row, "signal": full.get("signal"), "exit": full.get("exit"),
                     "regime_filter": full.get("regime_filter"),
                     "sizing": full.get("sizing")})
        obj = objective(
            {"pf": row["pf"], "return_pct": row["return_pct"], "trades": row["trades"]},
            years,
        )
        if obj > best_obj:
            best_obj = obj
            best = (obj, full, row)
        if (t + 1) % 40 == 0:
            br = best[2]
            print(f"[{t+1}/{args.n}] best_obj={best_obj:.1f} pf={br.get('pf', 0):.3f} "
                  f"cagr={cagr_from_return_pct(float(br.get('return_pct', 0)), years):.2f}% "
                  f"hit={br.get('targets_ok', False)}")

    # Line-search risk_pct on the highest-PF trial (pushes CAGR; may need PF re-check).
    if rows:
        best_pf_row = max(rows, key=lambda r: (r["pf"], r["return_pct"]))
        if best_pf_row["pf"] >= 1.25:
            seed_spec = copy.deepcopy(base)
            deep_merge(
                seed_spec,
                {
                    "signal": best_pf_row.get("signal") or {},
                    "exit": best_pf_row.get("exit") or {},
                    "sizing": best_pf_row.get("sizing") or {},
                },
            )
            if "regime_filter" in best_pf_row:
                seed_spec["regime_filter"] = best_pf_row["regime_filter"]
            risks = [round(x * 0.35, 3) for x in range(2, 28)]  # 0.7 .. 9.45
            pr, psp, _ = polish_risk_pct(seed_spec, years, OUT, risks)
            if pr and psp:
                obj_p = objective(
                    {"pf": pr["pf"], "return_pct": pr["return_pct"], "trades": pr["trades"]},
                    years,
                )
                if obj_p > best_obj:
                    best_obj = obj_p
                    best = (obj_p, psp, pr)
                    rows.append(
                        {
                            **pr,
                            "signal": psp.get("signal"),
                            "exit": psp.get("exit"),
                            "regime_filter": psp.get("regime_filter"),
                            "sizing": psp.get("sizing"),
                            "polish_risk": True,
                        }
                    )
                    print(
                        f"[polish-risk] improved -> pf={pr['pf']:.3f} "
                        f"cagr={pr.get('cagr_pct', 0):.2f}% ret={pr['return_pct']:.2f}% "
                        f"risk={psp.get('sizing', {}).get('risk_pct')}",
                    )

    winner_spec = best[1]
    winner_row = best[2]
    ok = meets_targets(
        {"pf": winner_row["pf"], "return_pct": winner_row["return_pct"], "trades": winner_row["trades"]},
        years,
    )

    summary = {
        "window": [cfg["windows"]["is_start"], cfg["windows"]["is_end"]],
        "years": years,
        "targets": {"pf_gt": 1.5, "cagr_pct_gt": 10.0, "trades_min": 50},
        "best_met_targets": bool(ok),
        "best_objective": best_obj,
        "best_metrics": winner_row,
        "best_cagr_pct": cagr_from_return_pct(float(winner_row.get("return_pct", 0.0)), years),
        "n_trials": args.n,
        "seed": args.seed,
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2, default=float))
    (OUT / "winner_spec.json").write_text(json.dumps(winner_spec, indent=2))
    (OUT / "all_trials.json").write_text(json.dumps(rows, indent=2, default=float))

    print("\n=== Best ===")
    print(json.dumps({**winner_row, "cagr_pct": summary["best_cagr_pct"],
                      "targets_ok": ok}, indent=2, default=float))

    if not args.no_write_spec:
        shutil.copy2(OUT / "winner_spec.json", STRAT_DIR / "spec.json")
        print(f"\nWrote {STRAT_DIR / 'spec.json'} (best candidate by score)")

    if not ok:
        print(
            "\nNote: No trial met PF>1.5 AND CAGR>10% AND trades>=50 on this IS window. "
            "Best compromise is in spec.json; widen search (--n), relax targets, or extend data.",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
