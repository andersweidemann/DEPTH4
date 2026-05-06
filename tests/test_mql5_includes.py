"""Structural sanity checks for MQL5 include files.

True validation requires metaeditor64 on Windows; these tests catch the common
damage an LLM can inflict when editing the includes:
- Unbalanced braces / parentheses
- Missing or duplicated header guards
- Missing counterpart for a Python primitive
- Forbidden patterns (e.g. martingale code sneaking in)
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from agents import config, risk


INCLUDE_DIR = config.repo_root() / "common" / "include"
INCLUDES = ["Signals.mqh", "Regime.mqh", "Risk.mqh"]


@pytest.mark.parametrize("name", INCLUDES)
def test_include_exists(name):
    assert (INCLUDE_DIR / name).exists(), f"missing {name}"


@pytest.mark.parametrize("name", INCLUDES)
def test_header_guard(name):
    src = (INCLUDE_DIR / name).read_text()
    guards = re.findall(r"#ifndef\s+__(\w+)__", src)
    assert len(guards) == 1, f"{name}: expected exactly one header guard, got {guards}"
    token = guards[0]
    assert f"#define __{token}__" in src, f"{name}: missing #define matching #ifndef"
    assert src.rstrip().endswith("#endif"), f"{name}: must end with #endif"


@pytest.mark.parametrize("name", INCLUDES)
def test_braces_balanced(name):
    src = (INCLUDE_DIR / name).read_text()
    # Strip line comments and block comments before counting so braces inside
    # don't skew the total.
    stripped = re.sub(r"//.*", "", src)
    stripped = re.sub(r"/\*.*?\*/", "", stripped, flags=re.DOTALL)
    opens = stripped.count("{")
    closes = stripped.count("}")
    assert opens == closes, f"{name}: brace mismatch ({opens} {{ vs {closes} }})"


@pytest.mark.parametrize("name", INCLUDES)
def test_parens_balanced(name):
    src = (INCLUDE_DIR / name).read_text()
    stripped = re.sub(r"//.*", "", src)
    stripped = re.sub(r"/\*.*?\*/", "", stripped, flags=re.DOTALL)
    # Remove string literals so parens inside strings don't leak.
    stripped = re.sub(r'"[^"]*"', "", stripped)
    opens = stripped.count("(")
    closes = stripped.count(")")
    assert opens == closes, f"{name}: paren mismatch ({opens} ( vs {closes} ))"


@pytest.mark.parametrize("name", INCLUDES)
def test_no_forbidden_patterns(name):
    """Same martingale / grid patterns Risk Officer bans in strategies."""
    v = risk.check_source_file(INCLUDE_DIR / name)
    forbidden = [f for f in v.failures if f.startswith("forbidden_pattern")]
    assert not forbidden, f"{name}: {forbidden}"


def test_signals_mqh_has_primitive_counterparts():
    """Every Python signals primitive needs an MQL5 twin so Translator has a
    target to bind to."""
    src = (INCLUDE_DIR / "Signals.mqh").read_text()
    for fn in ("SigSMA", "SigEMA", "SigATR", "SigRSI",
               "SigBollinger", "SigBBWidth", "SigDonchian",
               "SigATRBreakoutLevels", "SigSessionMask"):
        assert fn in src, f"Signals.mqh missing {fn}"


def test_regime_mqh_has_primitive_counterparts():
    src = (INCLUDE_DIR / "Regime.mqh").read_text()
    for fn in ("RegADX", "RegATRPercentile", "RegClassify"):
        assert fn in src, f"Regime.mqh missing {fn}"
    # Enum must list all 4 regimes, matching Python's regime.REGIMES.
    for r in ("REG_TREND", "REG_RANGE", "REG_VOLATILE", "REG_QUIET"):
        assert r in src, f"Regime.mqh missing enum value {r}"


def test_risk_mqh_has_primitive_counterparts():
    src = (INCLUDE_DIR / "Risk.mqh").read_text()
    for fn in ("RiskLotsByPct", "RiskDailyKillOK", "RiskSpreadOK"):
        assert fn in src, f"Risk.mqh missing {fn}"


def test_signals_mqh_donchian_uses_shift_plus_one():
    """The Python Donchian shifts by 1 to avoid lookahead; the MQL5 twin must
    match or the parity harness will diverge."""
    src = (INCLUDE_DIR / "Signals.mqh").read_text()
    # iHighest / iLowest must be called with `shift + 1`.
    assert re.search(r"iHighest\([^)]*shift\s*\+\s*1", src), \
        "Signals.mqh Donchian must pass shift+1 to iHighest"
    assert re.search(r"iLowest\([^)]*shift\s*\+\s*1", src), \
        "Signals.mqh Donchian must pass shift+1 to iLowest"
