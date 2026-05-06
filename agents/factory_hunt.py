"""
Run the EA factory for multiple generations until we find winners.

Two stop modes (first that fires):
  * **strict** — same as ``run_loop``: IS + walk-forward OOS both pass ``acceptance``
    from config.yaml (translator runs on first strict accept).
  * **hunt** (default) — collect up to ``--target`` candidates whose **in-sample**
    backtest is clearly profitable on every symbol/TF combo (looser than the
    production gate so something actually surfaces during research).

Usage:
    python -m agents.factory_hunt --max-gens 12 --target 2
    python -m agents.factory_hunt --max-gens 20 --strict --stop-on-accept
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from agents import acceptance, config, run_loop


def _is_summary_path(gen: int, cand: str) -> Path:
    return config.repo_root() / "reports" / f"gen_{gen:03d}" / cand / "is_summary.json"


def hunt_profitable_is(summary: Dict[str, Any]) -> Tuple[bool, str]:
    """IS-only screen aligned with config acceptance (slightly looser Sharpe/DD)."""
    combos = summary.get("combos") or []
    if not combos:
        return False, "no_combos"
    gate = acceptance.default_gate()
    years = acceptance.years_in_summary_window(summary)
    for c in combos:
        m = c.get("metrics") or {}
        sym = f"{c.get('symbol')}_{c.get('timeframe')}"
        if m.get("return_pct", -1e9) <= 0:
            return False, f"{sym}:return<=0"
        cagr = acceptance.annualized_cagr(m.get("return_pct", 0), years)
        if cagr <= gate.return_cagr_pct_min:
            return False, f"{sym}:cagr<={gate.return_cagr_pct_min:.1f}"
        if m.get("pf", 0) <= gate.pf_min:
            return False, f"{sym}:pf<={gate.pf_min}"
        if m.get("sharpe", -1e9) < max(0.25, gate.sharpe_min - 0.2):
            return False, f"{sym}:sharpe_low"
        if m.get("max_dd_pct", 0) > max(25.0, gate.max_dd_pct + 3.0):
            return False, f"{sym}:dd_high"
        if m.get("trades", 0) < max(60, gate.trades_min - 40):
            return False, f"{sym}:trades_low"
    return True, "ok"


def scan_gen(gen: int) -> Dict[str, Any]:
    """Scan all candidates in gen for IS summaries + acceptance states."""
    root = config.repo_root() / "strategies" / f"gen_{gen:03d}"
    out: Dict[str, Any] = {"gen": gen, "candidates": []}
    if not root.is_dir():
        return out
    gate = acceptance.default_gate()
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        summ_path = _is_summary_path(gen, d.name)
        if not summ_path.exists():
            continue
        summary = json.loads(summ_path.read_text())
        strict = acceptance.candidate_passes(summary, gate)
        hunt_ok, hunt_reason = hunt_profitable_is(summary)
        out["candidates"].append({
            "name": d.name,
            "path": str(d),
            "strict_is_pass": strict["pass"],
            "strict_failures": strict.get("failures", []),
            "hunt_profitable": hunt_ok,
            "hunt_reason": hunt_reason,
            "combos": summary.get("combos", []),
        })
    return out


def main() -> int:
    p = argparse.ArgumentParser(description="EA factory multi-gen hunt")
    p.add_argument("--max-gens", type=int, default=15)
    p.add_argument("--target", type=int, default=2,
                   help="Stop after this many hunt-profitable candidates (strict mode ignores)")
    p.add_argument("--strict", action="store_true",
                   help="Stop only on full IS+OOS acceptance (same as run_loop --stop-on-accept)")
    p.add_argument(
        "--config",
        metavar="PATH",
        default=None,
        help="Optional campaign YAML merged over config.yaml. "
        "Or set TRADING_CONFIG_OVERLAY.",
    )
    args = p.parse_args()

    overlay = args.config or os.environ.get("TRADING_CONFIG_OVERLAY")
    if overlay:
        overlay = overlay.strip()
    config.set_overlay(overlay)

    rep_root = config.repo_root() / "reports" / "factory_hunt"
    rep_root.mkdir(parents=True, exist_ok=True)

    start = run_loop._next_gen_number()
    hunt_winners: List[Dict[str, Any]] = []
    strict_accept: Optional[Dict[str, Any]] = None
    gens_run = 0

    for i in range(args.max_gens):
        gen = start + i
        gens_run = i + 1
        done_hunt = False
        print(f"\n{'='*60}\nFACTORY HUNT gen {gen} ({i+1}/{args.max_gens})\n{'='*60}")

        cfg = config.load()
        every = cfg["loop"].get("scout_every_n_gens", 5)
        if every and ((gen - 1) % every == 0):
            try:
                from agents import scout
                scout.run(max_per_query=cfg["scout"].get("max_results_per_query", 25))
            except Exception as e:  # noqa: BLE001
                print(f"[scout] skipped: {e}")

        try:
            result = run_loop.run_generation(gen)
        except Exception as e:  # noqa: BLE001
            print(f"[gen {gen}] FAILED: {e}")
            import traceback
            traceback.print_exc()
            continue

        scan = scan_gen(gen)
        (rep_root / f"scan_gen_{gen:03d}.json").write_text(
            json.dumps(scan, indent=2, default=float))

        if result.get("accepted"):
            strict_accept = {"gen": gen, "candidate": result["accepted"]}
            print(f"\n[STRICT ACCEPT] gen={gen} name={result['accepted']}")
            break

        for c in scan["candidates"]:
            if not c["hunt_profitable"]:
                continue
            key = (gen, c["name"])
            if any((w["gen"], w["name"]) == key for w in hunt_winners):
                continue
            hunt_winners.append({
                "gen": gen,
                "name": c["name"],
                "path": c["path"],
                "reason": c["hunt_reason"],
            })
            print(f"\n[HUNT WINNER #{len(hunt_winners)}] gen={gen} {c['name']}")
            if not args.strict and len(hunt_winners) >= args.target:
                done_hunt = True
                break

        if done_hunt:
            break

    final = {
        "start_gen": start,
        "hunt_winners": hunt_winners,
        "strict_accept": strict_accept,
        "stopped_after_gens": gens_run,
    }
    out_path = rep_root / "hunt_result.json"
    out_path.write_text(json.dumps(final, indent=2, default=str))
    print(f"\nWrote {out_path}")
    print(json.dumps(final, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
