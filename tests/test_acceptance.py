"""Tests for agents/acceptance.py (CAGR gate + candidate_passes)."""

from __future__ import annotations

import pytest

from agents import acceptance


def test_annualized_cagr_doubling_over_two_years():
    # +100% over 2y -> ~41.4% CAGR
    c = acceptance.annualized_cagr(100.0, 2.0)
    assert c == pytest.approx(41.421356, rel=1e-5)


def test_annualized_cagr_flat():
    assert acceptance.annualized_cagr(0.0, 4.5) == pytest.approx(0.0, abs=1e-9)


def test_years_in_summary_window_from_window_field():
    s = {
        "window": ["2020-01-01", "2024-06-30"],
        "combos": [],
    }
    y = acceptance.years_in_summary_window(s)
    assert 4.0 < y < 5.0


def test_combo_passes_with_cagr_and_pf():
    gate = acceptance.Gate(
        pf_min=1.5,
        return_cagr_pct_min=20.0,
        max_dd_pct=25.0,
        sharpe_min=0.4,
        trades_min=100,
        require_all_combos_positive=True,
    )
    years = 4.5
    # ~100% total over 4.5y -> CAGR ~17.5% < 20 -> fail
    m = {
        "pf": 1.6,
        "return_pct": 100.0,
        "max_dd_pct": 10.0,
        "sharpe": 0.5,
        "trades": 200.0,
    }
    assert acceptance.combo_passes(m, gate, years=years) is False
    # ~150% total over 4.5y -> CAGR ~21.5% > 20, PF > 1.5 -> pass
    m2 = dict(m, return_pct=150.0)
    assert acceptance.combo_passes(m2, gate, years=years) is True


def test_candidate_passes_all_combos():
    gate = acceptance.Gate(
        pf_min=1.5,
        return_cagr_pct_min=15.0,
        max_dd_pct=30.0,
        sharpe_min=0.3,
        trades_min=50,
        require_all_combos_positive=True,
    )
    summary = {
        "window": ["2020-01-01", "2022-01-01"],
        "combos": [
            {
                "symbol": "XAUUSD",
                "timeframe": "M5",
                "trades": 300,
                "metrics": {
                    "pf": 1.55,
                    "return_pct": 50.0,
                    "max_dd_pct": 8.0,
                    "sharpe": 0.8,
                    "trades": 300.0,
                },
            },
            {
                "symbol": "GER40",
                "timeframe": "M15",
                "trades": 280,
                "metrics": {
                    "pf": 1.6,
                    "return_pct": 45.0,
                    "max_dd_pct": 9.0,
                    "sharpe": 0.7,
                    "trades": 280.0,
                },
            },
        ],
    }
    v = acceptance.candidate_passes(summary, gate)
    assert v["pass"] is True
    assert v["years"] > 0
    assert all(p["metrics"].get("cagr_pct") is not None for p in v["per_combo"])
