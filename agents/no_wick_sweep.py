"""Parameter sweep for `no_wick_retest_ger40_m30`: compare signal toggles vs IS metrics.

Run from repo root:
  PYTHONPATH=. python agents/no_wick_sweep.py
  PYTHONPATH=. python agents/no_wick_sweep.py --no-apply   # dry run, no spec write
"""
from __future__ import annotations

import argparse
import copy
import csv
import itertools
import json
import re
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from agents.backtester import run_candidate  # noqa: E402

STRAT_DIR = REPO / "strategies/manual/no_wick_retest_ger40_m30"
OUT_ROOT = REPO / "reports/no_wick_sweep"


def deep_merge(a: dict, b: dict) -> dict:
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            deep_merge(a[k], v)
        else:
            a[k] = v
    return a


def load_base_spec() -> dict:
    return json.loads((STRAT_DIR / "spec.json").read_text())


def combo_metrics(summary: dict) -> dict:
    combos = summary.get("combos") or []
    if not combos:
        return {"trades": 0, "return_pct": 0.0, "pf": 0.0, "sharpe": 0.0, "max_dd_pct": 0.0,
                "win_rate": 0.0, "expectancy": 0.0}
    c0 = combos[0]
    m = c0.get("metrics") or {}
    return {
        "trades": int(c0.get("trades", 0) or m.get("trades", 0)),
        "return_pct": float(m.get("return_pct", 0.0)),
        "pf": float(m.get("pf", 0.0)),
        "sharpe": float(m.get("sharpe", 0.0)),
        "max_dd_pct": float(m.get("max_dd_pct", 0.0)),
        "win_rate": float(m.get("win_rate", 0.0)),
        "expectancy": float(m.get("expectancy", 0.0)),
    }


def rank_score(m: dict) -> float:
    """Higher is better; de-prioritise tiny samples."""
    trades = int(m["trades"])
    if trades < 15:
        return -1e9
    ret = float(m["return_pct"])
    pf = float(m["pf"])
    sharpe = float(m["sharpe"])
    pf_term = (pf - 1.0) * 25.0
    return ret + pf_term + sharpe * 4.0 + 0.02 * min(trades, 400)


def sort_key_for_winner(m: dict) -> Tuple:
    """Lexicographic: prefer PF>=1 & positive return, then return, PF, Sharpe."""
    trades = int(m["trades"])
    if trades < 15:
        return (-3, 0.0, 0.0, 0.0, 0.0)
    ret, pf, sh = float(m["return_pct"]), float(m["pf"]), float(m["sharpe"])
    tier = 2 if pf >= 1.0 and ret > 0 else (1 if pf >= 1.0 else 0)
    return (tier, ret, pf, sh)


def safe_run_id(parts: List[Any]) -> str:
    s = "_".join(str(p) for p in parts)
    s = re.sub(r"[^0-9a-zA-Z._-]+", "-", s)
    return s[:140] if len(s) > 140 else s


def run_one(run_id: str, spec: dict) -> Tuple[dict, dict]:
    cand = OUT_ROOT / "runs" / run_id
    cand.mkdir(parents=True, exist_ok=True)
    shutil.copy2(STRAT_DIR / "strategy.py", cand / "strategy.py")
    (cand / "spec.json").write_text(json.dumps(spec, indent=2))
    out_bt = OUT_ROOT / "bt" / run_id
    if out_bt.exists():
        shutil.rmtree(out_bt)
    out_bt.mkdir(parents=True, exist_ok=True)
    summary = run_candidate(cand, out_bt, label="is")
    m = combo_metrics(summary)
    row = {"run_id": run_id, **m, "rank_score": rank_score(m)}
    row["signal_json"] = json.dumps(spec.get("signal", {}), sort_keys=True)
    return row, spec


def phase1_grid() -> List[Dict[str, Any]]:
    keys = ("tp_r_mult", "break_even_enabled", "min_pullback_atr_mult",
             "trend_source", "sl_buffer_points")
    vals = (
        [1.0, 1.5, 2.0],
        [False, True],
        [0.0, 0.25],
        ["m30", "h1", "and"],
        [1.0, 2.0],
    )
    patches: List[Dict[str, Any]] = []
    for combo in itertools.product(*vals):
        p = dict(zip(keys, combo))
        patches.append({"signal": p})
    return patches


def phase2_patches() -> List[Dict[str, Any]]:
    """Refinement toggles applied one-at-a-time (caller merges onto a base spec)."""
    return [
        {},
        {"signal": {"vol_filter_enabled": True}},
        {"signal": {"confirm_close_beyond_level": True}},
        {"signal": {"wick_strict_zero": False}},
        {"signal": {"min_body_frac_of_range": 0.15, "close_near_extreme_frac": 0.55}},
        {"signal": {"cooldown_bars_after_loss": 4}},
        {"signal": {"max_trades_per_day": 4}},
        {"signal": {"sl_buffer_atr_mult": 0.15}},
    ]


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--no-apply", action="store_true", help="Do not write strategies/.../spec.json")
    p.add_argument("--top-k-phase2", type=int, default=5, help="Refine top K configs from phase 1")
    p.add_argument("--phase1-only", action="store_true")
    args = p.parse_args()

    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    (OUT_ROOT / "runs").mkdir(exist_ok=True)
    (OUT_ROOT / "bt").mkdir(exist_ok=True)

    base = load_base_spec()
    rows: List[dict] = []
    specs_by_id: Dict[str, dict] = {}

    # Phase 1
    grid1 = phase1_grid()
    for i, patch in enumerate(grid1):
        sig = patch.get("signal", {})
        run_id = safe_run_id(["p1", i] + [f"{k}={sig[k]}" for k in sorted(sig)])
        spec = copy.deepcopy(base)
        deep_merge(spec, patch)
        row, full = run_one(run_id, spec)
        rows.append(row)
        specs_by_id[run_id] = full
        print(f"[p1 {i+1}/{len(grid1)}] {run_id}  trades={row['trades']} "
              f"ret={row['return_pct']:.3f}% pf={row['pf']:.3f} score={row['rank_score']:.2f}")

    # Phase 2: top-K from phase 1 by sort_key
    if not args.phase1_only:
        p1_rows = [r for r in rows if r["run_id"].startswith("p1_")]
        p1_rows.sort(key=lambda r: sort_key_for_winner(r), reverse=True)
        seen_sig: set[str] = set()
        bases: List[Tuple[str, dict]] = []
        for r in p1_rows:
            sp = json.loads(r["signal_json"])
            key = json.dumps(sp, sort_keys=True)
            if key in seen_sig:
                continue
            seen_sig.add(key)
            bases.append((r["run_id"], specs_by_id[r["run_id"]]))
            if len(bases) >= args.top_k_phase2:
                break

        p2_i = 0
        for base_id, base_spec in bases:
            for j, patch in enumerate(phase2_patches()):
                spec = copy.deepcopy(base_spec)
                deep_merge(spec, patch)
                sig = spec.get("signal", {})
                run_id = safe_run_id(["p2", p2_i, "from", base_id[:40], "v", j])
                row, full = run_one(run_id, spec)
                rows.append(row)
                specs_by_id[run_id] = full
                print(f"[p2] {run_id}  trades={row['trades']} ret={row['return_pct']:.3f}% "
                      f"pf={row['pf']:.3f} score={row['rank_score']:.2f}")
                p2_i += 1

    # Winner
    rows.sort(key=lambda r: (sort_key_for_winner(r), r["rank_score"]), reverse=True)
    winner = rows[0]
    winner_spec = specs_by_id[winner["run_id"]]

    csv_path = OUT_ROOT / "sweep_results.csv"
    fieldnames = list(rows[0].keys()) if rows else []
    with csv_path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)

    (OUT_ROOT / "winner.json").write_text(
        json.dumps({"run_id": winner["run_id"], "metrics": {k: winner[k] for k in winner
                    if k not in ("signal_json",)}, "signal": winner_spec.get("signal")},
                   indent=2, default=float)
    )
    (OUT_ROOT / "winner_spec.json").write_text(json.dumps(winner_spec, indent=2))

    print("\n=== Top 12 by (PF>=1 & ret>0) tier, then return, PF, Sharpe ===")
    for r in rows[:12]:
        print(f"  {r['run_id'][:90]:90s}  T={r['trades']:4d}  "
              f"ret={r['return_pct']:8.3f}%  PF={r['pf']:.3f}  Sharpe={r['sharpe']:.3f}")

    if not args.no_apply:
        shutil.copy2(OUT_ROOT / "winner_spec.json", STRAT_DIR / "spec.json")
        print(f"\nApplied winner to {STRAT_DIR / 'spec.json'}")

    # Confirm single backtest on canonical dir
    if not args.no_apply:
        confirm = OUT_ROOT / "confirm"
        confirm.mkdir(exist_ok=True)
        summ = run_candidate(STRAT_DIR, confirm, label="is")
        m = combo_metrics(summ)
        print(f"Confirm run on strategy dir: trades={m['trades']} ret={m['return_pct']:.3f}% "
              f"pf={m['pf']:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
