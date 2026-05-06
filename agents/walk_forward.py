"""
Walk-forward OOS runner: rolls a window of (is_months, oos_months) across the
OOS period defined in config.yaml, backtests each OOS slice, and aggregates
metrics.

Only survivors after the IS ranking are passed through here (expensive).
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

import pandas as pd
from dateutil.relativedelta import relativedelta

from agents import backtester, config


@dataclass
class Window:
    is_start: str
    is_end: str
    oos_start: str
    oos_end: str


def build_windows(cfg: dict) -> List[Window]:
    wf = cfg["walk_forward"]
    w = cfg["windows"]
    is_months = wf["is_months"]
    oos_months = wf["oos_months"]

    oos_start = pd.Timestamp(w["oos_start"])
    today = pd.Timestamp.now(tz="UTC").normalize().tz_localize(None)
    oos_end_cap = today if w["oos_end"] == "today" else pd.Timestamp(w["oos_end"])

    windows: List[Window] = []
    cur = oos_start
    while cur < oos_end_cap:
        is_end = cur
        is_start = is_end - relativedelta(months=is_months)
        oos_slice_start = cur
        oos_slice_end = min(cur + relativedelta(months=oos_months), oos_end_cap)
        windows.append(Window(
            is_start.strftime("%Y-%m-%d"),
            is_end.strftime("%Y-%m-%d"),
            oos_slice_start.strftime("%Y-%m-%d"),
            oos_slice_end.strftime("%Y-%m-%d"),
        ))
        cur = oos_slice_end
    return windows


def run(candidate_dir: Path, out_dir: Path) -> Dict:
    cfg = config.load()
    windows = build_windows(cfg)
    aggregated: List[Dict] = []
    for i, w in enumerate(windows):
        slice_out = out_dir / f"wf_{i:02d}"
        slice_out.mkdir(parents=True, exist_ok=True)
        summary = backtester.run_candidate(
            candidate_dir, slice_out,
            window=(w.oos_start, w.oos_end),
            label="oos",
        )
        summary["window_index"] = i
        summary["is_window"] = [w.is_start, w.is_end]
        summary["oos_window"] = [w.oos_start, w.oos_end]
        aggregated.append(summary)

    result = {"candidate": candidate_dir.name, "windows": aggregated}
    (out_dir / "walk_forward.json").write_text(json.dumps(result, indent=2, default=float))
    return result


def cli() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--dir", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument(
        "--config",
        default=None,
        help="Optional campaign YAML merged over config.yaml (matrix lock + windows).",
    )
    args = p.parse_args()
    config.set_overlay(args.config.strip() if args.config else None)
    args.out.mkdir(parents=True, exist_ok=True)
    result = run(args.dir, args.out)
    print(json.dumps({"windows": len(result["windows"])}))
    return 0


if __name__ == "__main__":
    sys.exit(cli())
