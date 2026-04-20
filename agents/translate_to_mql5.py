"""
MQL5 Translator: converts an accepted Python strategy + spec into EA.mq5 and a
parity harness that dumps bar-by-bar signals for VPS-side diff.

Runs only on the winner at the end of `run_loop`. Writes:
  - strategies/gen_NNN/<candidate>/EA.mq5
  - strategies/gen_NNN/<candidate>/EA_parity_check.mq5
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from agents import config, llm_client


SIGNALS_MQH_EXPORTS = (
    "SigSMA, SigEMA, SigATR, SigRSI, SigBollinger, SigBBWidth, "
    "SigDonchian, SigATRBreakoutLevels, SigSessionMask"
)
REGIME_MQH_EXPORTS = "RegADX, RegATRPercentile, RegClassify"
RISK_MQH_EXPORTS = "RiskLotsByPct, RiskDailyKillOK, RiskSpreadOK"


def translate(candidate_dir: Path) -> dict:
    spec_path = candidate_dir / "spec.json"
    strategy_py = candidate_dir / "strategy.py"
    spec = json.loads(spec_path.read_text())
    py_src = strategy_py.read_text()

    template = llm_client.load_prompt("translator")
    rendered = llm_client.render(template, {
        "spec_json": json.dumps(spec, indent=2),
        "strategy_py": py_src,
        "risk_mqh_list": RISK_MQH_EXPORTS,
        "regime_mqh_list": REGIME_MQH_EXPORTS,
        "signals_mqh_list": SIGNALS_MQH_EXPORTS,
    })
    resp = llm_client.complete(
        system="You are the MQL5 Translator. Emit two files with the specified markers only.",
        user=rendered,
    )

    files = _split_files(resp)
    if "translation_failure.md" in files:
        (candidate_dir / "translation_failure.md").write_text(files["translation_failure.md"])
        return {"ok": False, "reason": files["translation_failure.md"]}

    if "EA.mq5" not in files or "EA_parity_check.mq5" not in files:
        (candidate_dir / "translation_raw.txt").write_text(resp)
        return {"ok": False, "reason": "missing_files_in_output"}

    (candidate_dir / "EA.mq5").write_text(files["EA.mq5"], encoding="utf-8")
    (candidate_dir / "EA_parity_check.mq5").write_text(
        files["EA_parity_check.mq5"], encoding="utf-8")
    return {"ok": True}


def _split_files(text: str) -> dict[str, str]:
    """Parse the `=== FILE: name ===` delimited multi-file response."""
    out: dict[str, str] = {}
    pattern = re.compile(r"===\s*FILE:\s*([^\s=]+)\s*===\s*\n", re.MULTILINE)
    matches = list(pattern.finditer(text))
    if not matches:
        return out
    for i, m in enumerate(matches):
        name = m.group(1).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        out[name] = text[start:end].strip() + "\n"
    return out


def cli() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--dir", type=Path, required=True, help="Candidate directory")
    args = p.parse_args()
    result = translate(args.dir)
    print(json.dumps(result))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(cli())
