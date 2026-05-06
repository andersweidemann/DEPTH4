"""Basic risk-manager unit tests. Run with: pytest"""

from __future__ import annotations

import tempfile
from pathlib import Path

from polybot.config import Settings
from polybot.journal import Journal
from polybot.risk import RiskManager


def _mk(tmp: Path, **overrides) -> tuple[Settings, Journal, RiskManager]:
    s = Settings(
        live_trading=False,
        journal_db_path=tmp / "j.db",
        kill_switch_file=tmp / "KILL",
        max_notional_per_order=2.0,
        max_notional_per_market=5.0,
        max_total_exposure=10.0,
        max_orders_per_day=3,
        max_daily_loss=5.0,
        min_edge=0.02,
        **overrides,
    )
    j = Journal(s.journal_db_path)
    return s, j, RiskManager(s, j)


def test_basic_buy_passes():
    with tempfile.TemporaryDirectory() as td:
        _, _, r = _mk(Path(td))
        v = r.check(
            side="BUY", price=0.4, size=3.0,
            market_exposure=0.0, total_exposure=0.0, edge=0.05,
        )
        assert v.ok, v.reason


def test_price_bounds():
    with tempfile.TemporaryDirectory() as td:
        _, _, r = _mk(Path(td))
        assert not r.check(
            side="BUY", price=0.0, size=1,
            market_exposure=0, total_exposure=0, edge=0.05,
        ).ok
        assert not r.check(
            side="BUY", price=1.0, size=1,
            market_exposure=0, total_exposure=0, edge=0.05,
        ).ok


def test_per_order_cap():
    with tempfile.TemporaryDirectory() as td:
        _, _, r = _mk(Path(td))
        v = r.check(
            side="BUY", price=0.5, size=10,
            market_exposure=0, total_exposure=0, edge=0.05,
        )
        assert not v.ok
        assert "MAX_NOTIONAL_PER_ORDER" in v.reason


def test_per_market_cap():
    with tempfile.TemporaryDirectory() as td:
        _, _, r = _mk(Path(td))
        v = r.check(
            side="BUY", price=0.5, size=3,
            market_exposure=4.0, total_exposure=4.0, edge=0.05,
        )
        assert not v.ok
        assert "MAX_NOTIONAL_PER_MARKET" in v.reason


def test_total_exposure_cap():
    with tempfile.TemporaryDirectory() as td:
        _, _, r = _mk(Path(td))
        v = r.check(
            side="BUY", price=0.5, size=3,
            market_exposure=0.0, total_exposure=9.0, edge=0.05,
        )
        assert not v.ok
        assert "MAX_TOTAL_EXPOSURE" in v.reason


def test_min_edge():
    with tempfile.TemporaryDirectory() as td:
        _, _, r = _mk(Path(td))
        v = r.check(
            side="BUY", price=0.5, size=1,
            market_exposure=0, total_exposure=0, edge=0.001,
        )
        assert not v.ok
        assert "MIN_EDGE" in v.reason


def test_kill_switch():
    with tempfile.TemporaryDirectory() as td:
        s, _, r = _mk(Path(td))
        s.kill_switch_file.parent.mkdir(parents=True, exist_ok=True)
        s.kill_switch_file.touch()
        v = r.check(
            side="BUY", price=0.4, size=1,
            market_exposure=0, total_exposure=0, edge=0.05,
        )
        assert not v.ok
        assert "kill switch" in v.reason
