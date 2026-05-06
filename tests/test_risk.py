"""Tests for agents/risk.py.

Covers:
- lots_by_risk_pct sizing formula on XAUUSD and GER40
- DailyKillState state machine (new day reset, drawdown trip, rollover)
- spread_ok threshold
- check_source_file on good/bad Python and MQL5 fixtures
"""
from __future__ import annotations

from pathlib import Path

import pytest

from agents import risk


# -------- lots_by_risk_pct -------------------------------------------------

def test_lots_xauusd_formula():
    # XAUUSD: contract_size=100, point_size=0.01.
    # 1% of $100k = $1000 risk, SL 1000 points away.
    # loss_per_lot = 100 * 0.01 * 1000 = $1000 -> lots = 1.0.
    lots = risk.lots_by_risk_pct(100_000.0, 1000.0, 1.0, "XAUUSD")
    assert lots == pytest.approx(1.0)


def test_lots_ger40_formula():
    # GER40: contract_size=1, point_size=0.1.
    # 1% of $100k = $1000 risk, SL 500 points (50 index pts) away.
    # loss_per_lot = 1 * 0.1 * 500 = $50 -> lots = 20.0.
    lots = risk.lots_by_risk_pct(100_000.0, 500.0, 1.0, "GER40")
    assert lots == pytest.approx(20.0)


def test_lots_clamps_to_min_001():
    # Tiny risk -> would round to 0, but function enforces 0.01 floor.
    lots = risk.lots_by_risk_pct(100.0, 1000.0, 0.01, "XAUUSD")
    assert lots >= 0.01


def test_lots_zero_on_bad_sl():
    assert risk.lots_by_risk_pct(100_000.0, 0.0, 1.0, "XAUUSD") == 0.0
    assert risk.lots_by_risk_pct(100_000.0, -5.0, 1.0, "XAUUSD") == 0.0


def test_lots_unknown_symbol_uses_defaults():
    # Unknown symbol falls back to {point_size: 0.01, contract_size: 1.0}.
    # So loss_per_lot = 1 * 0.01 * 1000 = 10 -> risk_cash 1000 -> 100 lots.
    lots = risk.lots_by_risk_pct(100_000.0, 1000.0, 1.0, "UNKNOWN")
    assert lots == pytest.approx(100.0)


# -------- DailyKillState ---------------------------------------------------

def test_daily_kill_ok_first_call_sets_baseline():
    s = risk.DailyKillState()
    assert risk.daily_kill_ok(s, "2024-01-01", 10_000.0, 5.0) is True
    assert s.current_day == "2024-01-01"
    assert s.start_of_day_equity == 10_000.0


def test_daily_kill_trips_on_threshold_breach():
    s = risk.DailyKillState()
    risk.daily_kill_ok(s, "2024-01-01", 10_000.0, 5.0)
    # Drawdown of 5% (equity fell to 9500) trips the kill.
    assert risk.daily_kill_ok(s, "2024-01-01", 9_500.0, 5.0) is False
    assert s.kill_until_next_day is True


def test_daily_kill_stays_tripped_same_day():
    s = risk.DailyKillState()
    risk.daily_kill_ok(s, "2024-01-01", 10_000.0, 5.0)
    risk.daily_kill_ok(s, "2024-01-01", 9_500.0, 5.0)  # trip
    # Even if equity recovers, kill stays active until next day.
    assert risk.daily_kill_ok(s, "2024-01-01", 11_000.0, 5.0) is False


def test_daily_kill_resets_next_day():
    s = risk.DailyKillState()
    risk.daily_kill_ok(s, "2024-01-01", 10_000.0, 5.0)
    risk.daily_kill_ok(s, "2024-01-01", 9_500.0, 5.0)  # trip
    assert risk.daily_kill_ok(s, "2024-01-02", 9_500.0, 5.0) is True
    assert s.start_of_day_equity == 9_500.0
    assert s.kill_until_next_day is False


def test_daily_kill_zero_equity_passes():
    # Degenerate case: start equity is 0 -> we can't compute DD, permit.
    s = risk.DailyKillState(current_day="2024-01-01",
                            start_of_day_equity=0.0)
    assert risk.daily_kill_ok(s, "2024-01-01", 5_000.0, 5.0) is True


# -------- spread_ok --------------------------------------------------------

def test_spread_ok_accept():
    assert risk.spread_ok(10.0, 20.0) is True
    assert risk.spread_ok(20.0, 20.0) is True  # boundary inclusive


def test_spread_ok_reject():
    assert risk.spread_ok(21.0, 20.0) is False


# -------- check_source_file (static Python) --------------------------------

GOOD_PY = '''
from agents import risk

class Strategy:
    def next(self):
        lots = risk.lots_by_risk_pct(self.equity, 100, 1.0, "XAUUSD")
        self.sl_price = self.price - 10
        if lots > 0:
            self.buy(sl=self.sl_price)
        if not risk.daily_kill_ok(self._state, "2024-01-01", self.equity, 5.0):
            return
        spread = 15
        if not risk.spread_ok(spread, 30):
            return
        max_spread_points = 30
'''

BAD_MARTINGALE_PY = '''
from agents import risk
class Strategy:
    def next(self):
        lots = risk.lots_by_risk_pct(self.equity, 100, 1.0, "XAUUSD")
        self.sl_price = 100
        lot *= 2  # martingale pattern
        self.buy(sl=self.sl_price)
'''

BAD_NO_SL_PY = '''
from agents import risk
class Strategy:
    def next(self):
        lots = risk.lots_by_risk_pct(self.equity, 100, 1.0, "XAUUSD")
        self.buy(size=lots)  # no sl_price set anywhere
'''

BAD_LITERAL_LOT_PY = '''
from agents import risk
class Strategy:
    def next(self):
        lots = risk.lots_by_risk_pct(self.equity, 100, 1.0, "XAUUSD")
        self.sl_price = 100
        self.buy(size=0.5)  # literal lot size -> violates risk-%-only rule
'''

GOOD_MQL5 = '''
#include <Risk.mqh>
double lots = RiskLotsByPct(_Symbol, 1.0, 200);
double sl = Bid - 100 * _Point;
if(lots > 0) OrderSend(_Symbol, OP_BUY, lots, Ask, 3, sl, 0);
'''

BAD_MQL5_NO_RISK = '''
#include <Trade/Trade.mqh>
double lots = 0.10;
double sl = Bid - 100 * _Point;
OrderSend(_Symbol, OP_BUY, lots, Ask, 3, sl, 0);
'''


@pytest.fixture
def write_src(tmp_path):
    def _write(name: str, content: str) -> Path:
        p = tmp_path / name
        p.write_text(content)
        return p
    return _write


def test_check_source_good_py_passes(write_src):
    p = write_src("strategy.py", GOOD_PY)
    v = risk.check_source_file(p)
    assert v.pass_ is True, v.failures


def test_check_source_martingale_fails(write_src):
    p = write_src("strategy.py", BAD_MARTINGALE_PY)
    v = risk.check_source_file(p)
    assert v.pass_ is False
    assert any("forbidden_pattern" in f for f in v.failures)


def test_check_source_no_sl_fails(write_src):
    p = write_src("strategy.py", BAD_NO_SL_PY)
    v = risk.check_source_file(p)
    assert v.pass_ is False
    assert "no_sl_price_set" in v.failures


def test_check_source_literal_lot_fails(write_src):
    p = write_src("strategy.py", BAD_LITERAL_LOT_PY)
    v = risk.check_source_file(p)
    assert v.pass_ is False
    assert "literal_lot_size" in v.failures


BAD_PREFIX_RISK_PY = '''
from agents.risk import lots_by_risk_pct, DailyKillState

class Strategy:
    def next(self):
        self._kill = risk.DailyKillState()
        lots = lots_by_risk_pct(10000.0, 100, 1.0, "XAUUSD")
        self.sl_price = 1.0
        self.buy(size=lots)
'''


def test_check_source_prefixed_risk_without_module_import_fails(write_src):
    p = write_src("strategy.py", BAD_PREFIX_RISK_PY)
    v = risk.check_source_file(p)
    assert v.pass_ is False
    assert "prefixed_risk_without_import" in v.failures


def test_check_source_mql5_good_passes(write_src):
    p = write_src("EA.mq5", GOOD_MQL5)
    v = risk.check_source_file(p)
    assert v.pass_ is True, v.failures


def test_check_source_mql5_missing_risk_fails(write_src):
    p = write_src("EA.mq5", BAD_MQL5_NO_RISK)
    v = risk.check_source_file(p)
    assert v.pass_ is False
    assert "no_RiskLotsByPct_call" in v.failures
