"""
Autonomous Mac-local loop:

  Scout (every N gens) -> Architect -> Coder -> RiskOfficer -> Backtester ->
  Critic -> (if any survivor passes acceptance) Translator -> stop.

Commits per generation are the user's responsibility; we write everything under
strategies/gen_NNN/ and reports/gen_NNN/ so `git add -A && git commit` is clean.

Usage:
    python -m agents.run_loop --gens 20 --stop-on-accept
    python -m agents.run_loop --only architect --gen 3
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import traceback
from dataclasses import asdict
from pathlib import Path
from typing import Dict, List, Optional

from agents import (acceptance, backtester, config, llm_client,
                    risk, scout, translate_to_mql5, walk_forward)


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

def _gen_dir(n: int) -> Path:
    d = config.repo_root() / "strategies" / f"gen_{n:03d}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _reports_dir(n: int) -> Path:
    d = config.repo_root() / "reports" / f"gen_{n:03d}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _next_gen_number() -> int:
    root = config.repo_root() / "strategies"
    root.mkdir(parents=True, exist_ok=True)
    existing = sorted(p.name for p in root.glob("gen_*") if p.is_dir())
    if not existing:
        return 1
    last = int(existing[-1].split("_")[1])
    return last + 1


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip_code_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\n", "", t)
        t = re.sub(r"\n```\s*$", "", t)
    return t


def _load_scout_cards(limit: int = 30) -> str:
    cards_dir = config.repo_root() / "scouting" / "idea_cards"
    if not cards_dir.exists():
        return "(none)"
    cards = sorted(cards_dir.glob("*.md"))[:limit]
    if not cards:
        return "(none)"
    bits: List[str] = []
    for c in cards:
        bits.append(f"--- {c.name} ---\n{c.read_text()[:1200]}")
    return "\n".join(bits)


def _load_refinement_block(prev_gen: int) -> str:
    if prev_gen < 1:
        return ""
    summary = _reports_dir(prev_gen) / "summary.md"
    if not summary.exists():
        return ""
    txt = summary.read_text()
    return f"PREVIOUS GENERATION ({prev_gen})\n{txt[:4000]}\n"


def _load_prior_art_summary() -> str:
    pieces = []
    for name in ("dax10_strategy_fixed_BEST copy.txt",
                 "eustx50_strategy_fixed_BEST copy.txt"):
        p = config.repo_root() / name
        if p.exists():
            pieces.append(f"[{name}]\n{p.read_text()[:2000]}")
    return "\n\n".join(pieces) if pieces else "(none)"


# ---------------------------------------------------------------------------
# Architect
# ---------------------------------------------------------------------------

def run_architect(gen: int) -> List[Path]:
    cfg = config.load()
    n = cfg["loop"]["candidates_per_gen"]
    template = llm_client.load_prompt("architect")
    rendered = llm_client.render(template, {
        "symbols": ", ".join(s.upper() for s in cfg["symbols"].keys()),
        "timeframes": ", ".join(cfg["timeframes"]),
        "acceptance_json": json.dumps(cfg["acceptance"], indent=2),
        "signal_primitives": "sma, ema, atr, rsi, bollinger, bb_width, donchian, "
                             "atr_breakout_levels, session_mask",
        "regime_primitives": "adx, atr_percentile, classify",
        "prior_art_summary": _load_prior_art_summary(),
        "scout_idea_cards": _load_scout_cards(),
        "refinement_block": _load_refinement_block(gen - 1),
        "n_candidates": n,
    })
    resp = llm_client.complete(
        system="You are the Strategy Architect. Output a JSON array of spec objects only.",
        user=rendered,
    )
    text = _strip_code_fences(resp)
    specs = json.loads(text)
    if not isinstance(specs, list) or not specs:
        raise RuntimeError("Architect returned empty or non-array JSON")

    dirs: List[Path] = []
    gdir = _gen_dir(gen)
    for i, spec in enumerate(specs[:n]):
        slug = _sanitize_slug(spec.get("name") or f"cand_{i}")
        cdir = gdir / f"{i:02d}_{slug}"
        cdir.mkdir(parents=True, exist_ok=True)
        (cdir / "spec.json").write_text(json.dumps(spec, indent=2))
        dirs.append(cdir)
    return dirs


def _sanitize_slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9_]+", "_", name.lower()).strip("_")
    return s[:40] or "candidate"


# ---------------------------------------------------------------------------
# Coder
# ---------------------------------------------------------------------------

def run_coder(candidate_dir: Path) -> None:
    spec = json.loads((candidate_dir / "spec.json").read_text())
    template = llm_client.load_prompt("coder")

    base_src = (config.repo_root() / "agents" / "backtester.py").read_text()
    # Keep only the RegimeStrategy class (plus imports) to keep prompt small.
    base_excerpt = _extract_regime_strategy_source(base_src)

    rendered = llm_client.render(template, {
        "spec_json": json.dumps(spec, indent=2),
        "regime_strategy_source": base_excerpt,
        "signals_list": "sma, ema, atr, rsi, bollinger, bb_width, donchian, "
                        "atr_breakout_levels, session_mask",
        "regime_list": "adx, atr_percentile, classify, REGIMES",
        "risk_list": "lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState",
    })
    resp = llm_client.complete(
        system="You are the Python Coder. Output a single .py file only.",
        user=rendered,
    )
    text = _strip_code_fences(resp)
    (candidate_dir / "strategy.py").write_text(text)


def _extract_regime_strategy_source(src: str) -> str:
    # Grab from `class RegimeStrategy` to the next top-level `class` or EOF.
    m = re.search(r"(class RegimeStrategy\(Strategy\):)", src)
    if not m:
        return src[:3000]
    start = m.start()
    tail = src[start:]
    m2 = re.search(r"\n(?:class |def )[A-Za-z_]", tail[10:])
    end = (m2.start() + 10) if m2 else min(len(tail), 3000)
    return tail[:end]


# ---------------------------------------------------------------------------
# Risk check
# ---------------------------------------------------------------------------

def run_risk(candidate_dir: Path) -> Dict:
    v = risk.check_source_file(candidate_dir / "strategy.py")
    (candidate_dir / "risk_verdict.json").write_text(
        json.dumps(v.to_dict(), indent=2))
    return v.to_dict()


# ---------------------------------------------------------------------------
# Backtest
# ---------------------------------------------------------------------------

def run_backtest(candidate_dir: Path, gen: int, label: str = "is") -> Dict:
    out = _reports_dir(gen) / candidate_dir.name
    out.mkdir(parents=True, exist_ok=True)
    return backtester.run_candidate(candidate_dir, out, label=label)


# ---------------------------------------------------------------------------
# Critic
# ---------------------------------------------------------------------------

def run_critic(gen: int, candidate_dirs: List[Path]) -> Dict:
    cfg = config.load()
    is_summaries: List[Dict] = []
    for c in candidate_dirs:
        p = _reports_dir(gen) / c.name / "is_summary.json"
        if p.exists():
            is_summaries.append(json.loads(p.read_text()))

    template = llm_client.load_prompt("critic")
    rendered = llm_client.render(template, {
        "candidates_metrics_json": json.dumps(is_summaries, indent=2, default=float),
        "acceptance_json": json.dumps(cfg["acceptance"], indent=2),
        "fitness_weights": "pf=0.30 sharpe=0.25 max_dd=-0.20 trades=0.15 consistency=0.10",
    })
    resp = llm_client.complete(
        system="You are the Critic. Output valid JSON only.",
        user=rendered,
    )
    text = _strip_code_fences(resp)
    critique = json.loads(text)

    (_reports_dir(gen) / "critic.json").write_text(json.dumps(critique, indent=2))
    summary_md = critique.get("summary_markdown", "")
    (_reports_dir(gen) / "summary.md").write_text(summary_md)

    notes = critique.get("per_survivor_notes", {}) or {}
    for c in candidate_dirs:
        note = notes.get(c.name) or notes.get(c.name.split("_", 1)[-1])
        if note:
            (c / "critic_notes.md").write_text(note)

    return critique


# ---------------------------------------------------------------------------
# One full generation
# ---------------------------------------------------------------------------

def run_generation(gen: int) -> Dict:
    print(f"\n=== generation {gen} ===")
    dirs = run_architect(gen)
    print(f"architect wrote {len(dirs)} candidates")

    alive: List[Path] = []
    for d in dirs:
        try:
            run_coder(d)
        except Exception as e:  # noqa: BLE001
            print(f"[coder] {d.name} failed: {e}")
            traceback.print_exc()
            continue
        verdict = run_risk(d)
        if not verdict["pass"]:
            print(f"[risk] {d.name} REJECTED: {verdict['failures']}")
            continue
        alive.append(d)

    if not alive:
        print("no candidates survived risk check")
        return {"gen": gen, "accepted": None, "survivors": []}

    for d in alive:
        try:
            run_backtest(d, gen, label="is")
        except Exception as e:  # noqa: BLE001
            print(f"[backtest] {d.name} failed: {e}")
            traceback.print_exc()

    critique = run_critic(gen, alive)
    survivors = [r for r in critique.get("ranking", []) if r.get("verdict") == "survive"]
    if not survivors:
        return {"gen": gen, "accepted": None, "survivors": []}

    # OOS walk-forward on survivors.
    accepted: Optional[Path] = None
    for s in survivors[: config.load()["loop"]["survivors"]]:
        cand_name = s["candidate"]
        cdir = next((d for d in alive if d.name == cand_name or d.name.endswith(cand_name)),
                    None)
        if cdir is None:
            continue
        wf_out = _reports_dir(gen) / cdir.name / "walk_forward"
        wf_out.mkdir(parents=True, exist_ok=True)
        wf_result = walk_forward.run(cdir, wf_out)

        # Aggregate OOS windows into an acceptance summary.
        combo_summaries = [w for w in wf_result["windows"]]
        oos_summary = _aggregate_wf(combo_summaries, cand_name)
        (_reports_dir(gen) / cdir.name / "oos_summary.json").write_text(
            json.dumps(oos_summary, indent=2, default=float))

        is_summary = json.loads(
            (_reports_dir(gen) / cdir.name / "is_summary.json").read_text())
        is_pass = acceptance.candidate_passes(is_summary)
        oos_pass = acceptance.candidate_passes(oos_summary)
        (_reports_dir(gen) / cdir.name / "acceptance.json").write_text(
            json.dumps({"is": is_pass, "oos": oos_pass}, indent=2))
        if is_pass["pass"] and oos_pass["pass"]:
            accepted = cdir
            break

    if accepted is None:
        return {"gen": gen, "accepted": None,
                "survivors": [s["candidate"] for s in survivors]}

    print(f"[accepted] {accepted.name} - invoking translator")
    t = translate_to_mql5.translate(accepted)
    if not t.get("ok"):
        print(f"[translator] failed: {t.get('reason')}")
        return {"gen": gen, "accepted": None,
                "survivors": [s["candidate"] for s in survivors]}
    return {"gen": gen, "accepted": accepted.name,
            "survivors": [s["candidate"] for s in survivors]}


def _aggregate_wf(windows: List[Dict], cand_name: str) -> Dict:
    """Collapse walk-forward windows into a single summary for acceptance."""
    combo_map: Dict[str, Dict] = {}
    for w in windows:
        for c in w.get("combos", []):
            key = f"{c['symbol']}_{c['timeframe']}"
            acc = combo_map.setdefault(key, {
                "symbol": c["symbol"], "timeframe": c["timeframe"],
                "trades": 0,
                "metrics": {"pf": [], "sharpe": [], "max_dd_pct": [],
                            "return_pct": [], "trades": 0},
            })
            acc["trades"] += int(c.get("trades", 0))
            m = c.get("metrics", {})
            for k in ("pf", "sharpe", "max_dd_pct", "return_pct"):
                if m.get(k) is not None:
                    acc["metrics"][k].append(m[k])
            acc["metrics"]["trades"] += m.get("trades", 0)

    combos_out = []
    for key, acc in combo_map.items():
        def avg(xs): return sum(xs) / len(xs) if xs else 0.0
        m = acc["metrics"]
        combos_out.append({
            "symbol": acc["symbol"], "timeframe": acc["timeframe"],
            "trades": acc["trades"],
            "metrics": {
                "pf": avg(m["pf"]),
                "sharpe": avg(m["sharpe"]),
                "max_dd_pct": max(m["max_dd_pct"]) if m["max_dd_pct"] else 0.0,
                "return_pct": avg(m["return_pct"]),
                "trades": m["trades"],
            },
        })
    return {"candidate": cand_name, "label": "oos", "combos": combos_out}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def cli() -> int:
    p = argparse.ArgumentParser(description="EA factory autonomous loop")
    p.add_argument("--gens", type=int, default=1)
    p.add_argument("--stop-on-accept", action="store_true")
    p.add_argument("--only", choices=("architect", "coder", "backtest", "critic",
                                      "translate", "scout"))
    p.add_argument("--gen", type=int, help="When --only is set, which gen to target")
    args = p.parse_args()

    cfg = config.load()

    if args.only == "scout":
        scout.run(max_per_query=cfg["scout"].get("max_results_per_query", 25))
        return 0

    start = _next_gen_number()
    results: List[Dict] = []
    for i in range(args.gens):
        gen = start + i

        # Optional Scout refresh every N gens.
        every = cfg["loop"].get("scout_every_n_gens", 5)
        if every and ((gen - 1) % every == 0):
            try:
                scout.run(max_per_query=cfg["scout"].get("max_results_per_query", 25))
            except Exception as e:  # noqa: BLE001
                print(f"[scout] skipped: {e}")

        if args.only:
            # Single-step mode (for the run-iteration skill).
            g = args.gen or gen
            dirs = sorted((config.repo_root() / "strategies" / f"gen_{g:03d}").glob("*"))
            if args.only == "architect":
                run_architect(g)
            elif args.only == "coder":
                for d in dirs:
                    run_coder(d)
            elif args.only == "backtest":
                for d in dirs:
                    run_backtest(d, g)
            elif args.only == "critic":
                run_critic(g, dirs)
            elif args.only == "translate":
                for d in dirs:
                    translate_to_mql5.translate(d)
            return 0

        result = run_generation(gen)
        results.append(result)
        if args.stop_on_accept and result.get("accepted"):
            print(f"\nACCEPTED: {result['accepted']} in gen {gen}")
            print("Next step: pull on VPS and run "
                  f"`python -m vps.validate --gen {gen} --candidate {result['accepted']}`")
            break

    print(json.dumps(results, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(cli())
