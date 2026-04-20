"""
VPS-only helpers that drive metaeditor64.exe and terminal64.exe.

Deliberately kept separate from agents/ so the Mac side doesn't import Windows
paths or MetaTrader5 package at all.
"""
from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

from agents import config


_TF_MT5 = {"M1": "M1", "M5": "M5", "M15": "M15", "M30": "M30",
           "H1": "H1", "H4": "H4", "D1": "D1"}


@dataclass
class CompileResult:
    ok: bool
    log_path: Path
    ex5_path: Optional[Path]
    message: str


def compile_ea(mq5_path: Path, include_dir: Optional[Path] = None) -> CompileResult:
    cfg = config.load()
    me = Path(cfg["vps"]["metaeditor_path"])
    if not me.exists():
        return CompileResult(False, Path(), None,
                             f"metaeditor not found at {me}")

    log_path = mq5_path.with_suffix(".log")
    cmd = [str(me), f"/compile:{mq5_path}", f"/log:{log_path}"]
    if include_dir:
        cmd.append(f"/include:{include_dir}")

    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    ex5 = mq5_path.with_suffix(".ex5")
    ok = proc.returncode == 0 and ex5.exists()
    return CompileResult(ok=ok, log_path=log_path,
                         ex5_path=ex5 if ex5.exists() else None,
                         message=(proc.stdout or "") + (proc.stderr or ""))


def write_tester_ini(dest: Path, expert_relpath: str, symbol: str, timeframe: str,
                     from_date: str, to_date: str, report_path: str) -> Path:
    template = (Path(__file__).parent / "tester_template.ini").read_text()
    rendered = (template
                .replace("{{expert_relpath}}", expert_relpath)
                .replace("{{symbol}}", symbol)
                .replace("{{timeframe}}", _TF_MT5.get(timeframe.upper(), timeframe))
                .replace("{{from_date}}", from_date)
                .replace("{{to_date}}", to_date)
                .replace("{{report_path}}", report_path))
    dest.write_text(rendered)
    return dest


def run_tester(ini_path: Path) -> subprocess.CompletedProcess:
    cfg = config.load()
    term = Path(cfg["vps"]["terminal_path"])
    if not term.exists():
        raise FileNotFoundError(f"terminal64 not found at {term}")
    cmd = [str(term), f"/config:{ini_path}", "/portable"]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=60 * 60 * 8)


def install_ea(candidate_dir: Path) -> Path:
    """Copy EA.mq5 and all common/include files into MT5's MQL5 tree, so
    `/compile:` can resolve includes."""
    cfg = config.load()
    term_root = Path(cfg["vps"]["terminal_path"]).parent  # MT5 install dir
    # For /portable runs we'd use the portable data dir instead; simplest for
    # now: rely on broker install data dir from %APPDATA%\MetaQuotes\Terminal\<hash>\MQL5.
    # User can override via config.yaml if needed.
    expert_dir = term_root / cfg["vps"]["mql5_experts_dir"]
    include_dir = term_root / cfg["vps"]["mql5_include_dir"]
    expert_dir.mkdir(parents=True, exist_ok=True)
    include_dir.mkdir(parents=True, exist_ok=True)

    repo_include = config.repo_root() / "common" / "include"
    for f in repo_include.glob("*.mqh"):
        shutil.copy2(f, include_dir / f.name)

    src = candidate_dir / "EA.mq5"
    dest = expert_dir / f"{candidate_dir.name}.mq5"
    shutil.copy2(src, dest)
    return dest
