"""Random search: PF > gate_pf AND return_pct > gate_return on GER40 M15 (tunable BB spec).

Usage:
  python -m agents.hunt_pf_return --trials 200
  python -m agents.hunt_pf_return --trials 80 --screen-window 2022-01-01 2024-06-30 --final-top 12
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from agents import config
from agents.backtester import run_candidate

STRAT_REL = Path("strategies/manual/hunt_ger40_bb_tune")


def _sample_tune(rng: random.Random) -> Dict[str, Any]:
    tp_choice = rng.choice([0.0, 0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0])
    return {
        "risk_pct": round(rng.uniform(0.15, 3.0), 3),
        "sl_atr_mult": round(rng.uniform(1.1, 3.2), 3),
        "time_stop_bars": rng.randint(10, 96),
        "rsi_long_max": round(rng.uniform(8.0, 38.0), 2),
        "rsi_short_min": round(rng.uniform(62.0, 92.0), 2),
        "bbw_min": round(rng.uniform(10.0, 55.0), 2),
        "bb_period": rng.randint(14, 34),
        "bb_dev": round(rng.uniform(1.35, 2.8), 3),
        "rsi_period": rng.randint(5, 16),
        "atr_period": rng.randint(8, 22),
        "bbw_lookback": rng.randint(150, 900),
        "tp_r_mult": tp_choice,
    }


def _metrics_from_summary(summary: Dict[str, Any]) -> Optional[Tuple[float, float, int]]:
    combos = summary.get("combos") or []
    if not combos:
        return None
    c0 = combos[0]
    m = c0.get("metrics") or {}
    pf = float(m.get("pf", 0.0))
    ret = float(m.get("return_pct", 0.0))
    trades = int(c0.get("trades", 0))
    return pf, ret, trades


def _passes(pf: float, ret: float, trades: int, min_trades: int, gate_pf: float, gate_ret: float) -> bool:
    if trades < min_trades:
        return False
    return pf > gate_pf and ret > gate_ret


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--trials", type=int, default=120)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--gate-pf", type=float, default=1.5)
    p.add_argument("--gate-return", type=float, default=15.0)
    p.add_argument("--min-trades", type=int, default=40)
    p.add_argument(
        "--screen-window",
        nargs=2,
        metavar=("START", "END"),
        default=None,
        help="Optional fast screen window (YYYY-MM-DD). If set, first phase scores on this window.",
    )
    p.add_argument("--final-top", type=int, default=16, help="Re-run full IS on this many best screen hits.")
    p.add_argument("--config", default=None, help="Optional campaign YAML overlay.")
    args = p.parse_args()

    config.set_overlay(args.config.strip() if args.config else None)
    root = config.repo_root()
    strat_dir = root / STRAT_REL
    spec_path = strat_dir / "spec.json"
    if not spec_path.exists():
        print(f"missing {spec_path}", file=sys.stderr)
        return 2

    base_spec = json.loads(spec_path.read_text())
    out_root = root / "reports" / "hunt_pf_return"
    out_root.mkdir(parents=True, exist_ok=True)

    rng = random.Random(args.seed)
    w_full = tuple(config.load()["windows"][k] for k in ("is_start", "is_end"))  # type: ignore[misc]
    screen_w: Optional[Tuple[str, str]] = None
    if args.screen_window:
        screen_w = (args.screen_window[0], args.screen_window[1])

    best_screen: List[Tuple[float, Dict[str, Any]]] = []

    def one_trial(tune: Dict[str, Any], window: Tuple[str, str], tag: str) -> Dict[str, Any]:
        spec = deepcopy(base_spec)
        spec["tune"] = tune
        spec_path.write_text(json.dumps(spec, indent=2))
        out_dir = out_root / tag
        out_dir.mkdir(parents=True, exist_ok=True)
        summary = run_candidate(
            strat_dir,
            out_dir,
            symbols=["GER40"],
            timeframes=["M15"],
            window=window,
            label="is",
        )
        return summary

    # Phase 1 (optional screen)
    trials = max(1, int(args.trials))
    if screen_w:
        for i in range(trials):
            tune = _sample_tune(rng)
            summary = one_trial(tune, screen_w, f"screen_{i:05d}")
            parsed = _metrics_from_summary(summary)
            if parsed is None:
                continue
            pf, ret, trades = parsed
            score = min(pf / args.gate_pf, 10.0) * min(max(ret, 0.0) / args.gate_return, 10.0) * min(
                trades / float(args.min_trades), 3.0
            )
            best_screen.append((score, tune))
        best_screen.sort(key=lambda x: -x[0])
        finalists = [t for _, t in best_screen[: max(1, args.final_top)]]
    else:
        finalists = []

    # Phase 2: either full random or finalist re-run
    best_overall: Optional[Tuple[float, float, float, Dict[str, Any]]] = None

    def consider(pf: float, ret: float, trades: int, tune: Dict[str, Any]) -> None:
        nonlocal best_overall
        edge = min(pf / args.gate_pf, 20.0) * min(max(ret, 0.0) / args.gate_return, 20.0)
        if best_overall is None or edge > best_overall[0]:
            best_overall = (edge, pf, ret, deepcopy(tune))

    def run_full_window_loop(prefix: str) -> int:
        for i in range(trials):
            tune = _sample_tune(rng)
            summary = one_trial(tune, (w_full[0], w_full[1]), f"{prefix}_{i:05d}")
            parsed = _metrics_from_summary(summary)
            if parsed is None:
                continue
            pf, ret, trades = parsed
            consider(pf, ret, trades, tune)
            if _passes(pf, ret, trades, args.min_trades, args.gate_pf, args.gate_return):
                winner_dir = root / "reports" / "hunt_pf_return" / "winner"
                winner_dir.mkdir(parents=True, exist_ok=True)
                spec_win = deepcopy(base_spec)
                spec_win["tune"] = tune
                (winner_dir / "spec_winner.json").write_text(json.dumps(spec_win, indent=2))
                (winner_dir / "is_summary.json").write_text(json.dumps(summary, indent=2, default=float))
                print(json.dumps({"ok": True, "pf": pf, "return_pct": ret, "trades": trades, "tune": tune}, indent=2))
                spec_path.write_text(json.dumps(base_spec, indent=2))
                return 0
        return 1

    if screen_w and finalists:
        for j, tune in enumerate(finalists):
            summary = one_trial(tune, (w_full[0], w_full[1]), f"final_{j:03d}")
            parsed = _metrics_from_summary(summary)
            if parsed is None:
                continue
            pf, ret, trades = parsed
            consider(pf, ret, trades, tune)
            if _passes(pf, ret, trades, args.min_trades, args.gate_pf, args.gate_return):
                winner_dir = root / "reports" / "hunt_pf_return" / "winner"
                winner_dir.mkdir(parents=True, exist_ok=True)
                spec_win = deepcopy(base_spec)
                spec_win["tune"] = tune
                (winner_dir / "spec_winner.json").write_text(json.dumps(spec_win, indent=2))
                (winner_dir / "is_summary.json").write_text(json.dumps(summary, indent=2, default=float))
                print(json.dumps({"ok": True, "pf": pf, "return_pct": ret, "trades": trades, "tune": tune}, indent=2))
                spec_path.write_text(json.dumps(base_spec, indent=2))
                return 0
    elif not screen_w:
        rc = run_full_window_loop("full")
        if rc == 0:
            return 0
    else:
        rc = run_full_window_loop("full_fallback")
        if rc == 0:
            return 0

    if best_overall:
        _, bpf, br, btune = best_overall
        print(
            json.dumps(
                {
                    "ok": False,
                    "best_near": {"pf": bpf, "return_pct": br, "tune": btune},
                    "gates": {"pf": args.gate_pf, "return_pct": args.gate_return},
                },
                indent=2,
            )
        )
    else:
        print(json.dumps({"ok": False, "reason": "no_valid_combos"}, indent=2))

    spec_path.write_text(json.dumps(base_spec, indent=2))
    return 1


if __name__ == "__main__":
    sys.exit(main())
