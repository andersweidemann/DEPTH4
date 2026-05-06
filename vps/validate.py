"""
Final validation on Windows VPS. Compiles the accepted EA, runs MT5 Strategy
Tester across all 4 symbol/TF combos for IS and a walk-forward OOS sweep,
parses reports, applies the acceptance gate against MT5 numbers, and writes
`reports/final/<version>/...`.

Usage:
    python -m vps.validate --gen 7 --candidate 02_atr_breakout_regime_v1
"""
from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Tuple

from agents import acceptance, config, walk_forward
from vps import mt5_runner


def find_candidate(gen: int, name: str) -> Path:
    root = config.repo_root() / "strategies" / f"gen_{gen:03d}"
    matches = [p for p in root.glob("*") if p.name == name or p.name.endswith(name)]
    if not matches:
        raise FileNotFoundError(f"candidate {name} not found under {root}")
    return matches[0]


def final_report_dir(gen: int, name: str) -> Path:
    d = config.repo_root() / "reports" / "final" / f"gen{gen:03d}_{name}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def parse_mt5_xml(xml_path: Path) -> Dict[str, float]:
    """Parse MT5's XML report into normalized metrics. MT5 writes reports with
    broker-specific columns, so we grep known field names."""
    if not xml_path.exists():
        return {}
    try:
        tree = ET.parse(xml_path)
    except ET.ParseError:
        return {}
    root = tree.getroot()
    flat: Dict[str, str] = {}
    for elem in root.iter():
        name = (elem.attrib.get("name") or elem.tag or "").strip()
        val = (elem.attrib.get("value") or elem.text or "").strip()
        if name and val:
            flat[name] = val

    def to_f(k: str, default: float = 0.0) -> float:
        v = flat.get(k, default)
        try:
            return float(str(v).replace(",", ""))
        except ValueError:
            return default

    # Best-effort mapping; keys vary between MT5 builds. The LLM Translator's
    # parity harness is authoritative when in doubt.
    return {
        "pf":          to_f("Profit Factor"),
        "sharpe":      to_f("Sharpe Ratio"),
        "max_dd_pct":  abs(to_f("Equity Drawdown Relative")) or abs(to_f("Maximal Drawdown")),
        "trades":      to_f("Total Trades") or to_f("Trades"),
        "return_pct":  to_f("Net Profit %"),
        "sortino":     to_f("Sortino Ratio"),
        "expectancy":  to_f("Expected Payoff"),
    }


def run_single(candidate_dir: Path, ea_installed: Path, symbol: str, tf: str,
               window: Tuple[str, str], out_dir: Path) -> Dict:
    ini = out_dir / f"{symbol}_{tf}.ini"
    report = out_dir / f"{symbol}_{tf}.xml"
    mt5_runner.write_tester_ini(
        ini,
        expert_relpath=str(ea_installed.relative_to(
            Path(config.load()["vps"]["terminal_path"]).parent)),
        symbol=symbol, timeframe=tf,
        from_date=window[0].replace("-", "."), to_date=window[1].replace("-", "."),
        report_path=str(report),
    )
    proc = mt5_runner.run_tester(ini)
    (out_dir / f"{symbol}_{tf}.runlog").write_text(
        (proc.stdout or "") + "\n---\n" + (proc.stderr or ""))
    metrics = parse_mt5_xml(report)
    return {"symbol": symbol, "timeframe": tf, "metrics": metrics,
            "trades": int(metrics.get("trades", 0))}


def validate(gen: int, name: str) -> Dict:
    cfg = config.load()
    candidate = find_candidate(gen, name)
    out = final_report_dir(gen, candidate.name)

    print(f"[compile] {candidate / 'EA.mq5'}")
    installed = mt5_runner.install_ea(candidate)
    result = mt5_runner.compile_ea(installed)
    (out / "compile.log").write_text(result.message)
    if not result.ok:
        (out / "verdict.md").write_text(f"COMPILE FAILED\n\n{result.message[:3000]}")
        return {"ok": False, "stage": "compile"}

    symbols = [s.upper() for s in cfg["symbols"].keys()]
    timeframes = cfg["timeframes"]
    w = cfg["windows"]

    is_combos: List[Dict] = []
    for sym in symbols:
        broker_sym = cfg["symbols"][sym.lower()]["broker_name"]
        for tf in timeframes:
            is_combos.append(run_single(
                candidate, installed, broker_sym, tf,
                (w["is_start"], w["is_end"]), out / "is"))
    (out / "is_summary.json").write_text(
        json.dumps({"combos": is_combos}, indent=2, default=float))

    oos_combos: List[Dict] = []
    oos_windows = walk_forward.build_windows(cfg)
    for sym in symbols:
        broker_sym = cfg["symbols"][sym.lower()]["broker_name"]
        for tf in timeframes:
            sym_combos = []
            for i, wnd in enumerate(oos_windows):
                res = run_single(candidate, installed, broker_sym, tf,
                                 (wnd.oos_start, wnd.oos_end), out / f"oos_{i:02d}")
                sym_combos.append(res)
            # Aggregate per-symbol/TF across OOS windows.
            agg = _avg_metrics(sym_combos, broker_sym, tf)
            oos_combos.append(agg)
    (out / "oos_summary.json").write_text(
        json.dumps({"combos": oos_combos}, indent=2, default=float))

    is_verdict = acceptance.candidate_passes({"combos": is_combos, "label": "is"})
    oos_verdict = acceptance.candidate_passes({"combos": oos_combos, "label": "oos"})
    verdict = {
        "compile_ok": True,
        "is": is_verdict,
        "oos": oos_verdict,
        "pass": is_verdict["pass"] and oos_verdict["pass"],
    }
    (out / "verdict.json").write_text(json.dumps(verdict, indent=2, default=float))
    (out / "verdict.md").write_text(_render_verdict_md(verdict, gen, name))
    print(f"[verdict] {'PASS' if verdict['pass'] else 'FAIL'} - see {out}")
    return verdict


def _avg_metrics(combos: List[Dict], symbol: str, tf: str) -> Dict:
    metrics_keys = ("pf", "sharpe", "max_dd_pct", "return_pct")
    acc: Dict[str, List[float]] = {k: [] for k in metrics_keys}
    trades = 0
    for c in combos:
        m = c.get("metrics") or {}
        trades += int(m.get("trades", 0))
        for k in metrics_keys:
            if m.get(k) is not None:
                acc[k].append(float(m[k]))
    def avg(xs): return sum(xs) / len(xs) if xs else 0.0
    return {
        "symbol": symbol, "timeframe": tf, "trades": trades,
        "metrics": {
            "pf": avg(acc["pf"]),
            "sharpe": avg(acc["sharpe"]),
            "max_dd_pct": max(acc["max_dd_pct"]) if acc["max_dd_pct"] else 0.0,
            "return_pct": avg(acc["return_pct"]),
            "trades": trades,
        },
    }


def _render_verdict_md(v: Dict, gen: int, name: str) -> str:
    lines = [f"# VPS verdict - gen{gen:03d} / {name}", ""]
    lines.append(f"Overall: {'PASS' if v['pass'] else 'FAIL'}")
    lines.append("")
    lines.append("## In-sample")
    lines.append(f"pass: {v['is']['pass']}  failures: {v['is'].get('failures', [])}")
    lines.append("")
    lines.append("## Out-of-sample (walk-forward)")
    lines.append(f"pass: {v['oos']['pass']}  failures: {v['oos'].get('failures', [])}")
    return "\n".join(lines) + "\n"


def cli() -> int:
    p = argparse.ArgumentParser(description="Validate an accepted EA on MT5")
    p.add_argument("--gen", type=int, required=True)
    p.add_argument("--candidate", required=True,
                   help="Candidate dir name under strategies/gen_NNN/")
    args = p.parse_args()
    v = validate(args.gen, args.candidate)
    return 0 if v.get("pass") else 1


if __name__ == "__main__":
    sys.exit(cli())
