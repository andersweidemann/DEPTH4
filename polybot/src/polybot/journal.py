"""SQLite journal — every decision, every order, every fill is persisted.

This is the audit trail. The bot should never take an action that isn't
recorded here first.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    strategy TEXT NOT NULL,
    market_id TEXT,
    token_id TEXT,
    side TEXT,              -- 'BUY' / 'SELL' / 'SKIP'
    price REAL,
    size REAL,
    notional REAL,
    reason TEXT,
    would_have_traded INTEGER NOT NULL DEFAULT 0,  -- dry-run indicator
    meta_json TEXT
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    decision_id INTEGER,
    order_id TEXT UNIQUE,   -- Polymarket's id
    market_id TEXT,
    token_id TEXT,
    side TEXT,
    price REAL,
    size REAL,
    status TEXT,            -- 'posted', 'filled', 'cancelled', 'rejected'
    raw_json TEXT,
    FOREIGN KEY (decision_id) REFERENCES decisions(id)
);

CREATE TABLE IF NOT EXISTS fills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    order_id TEXT,
    market_id TEXT,
    token_id TEXT,
    side TEXT,
    price REAL,
    size REAL,
    fee REAL,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS halts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    reason TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decisions_ts ON decisions(ts);
CREATE INDEX IF NOT EXISTS idx_orders_ts ON orders(ts);
CREATE INDEX IF NOT EXISTS idx_fills_ts ON fills(ts);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Journal:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as c:
            c.executescript(SCHEMA)

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(str(self.db_path), isolation_level=None)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    # ---- writes ----
    def record_decision(
        self,
        strategy: str,
        side: str,
        market_id: Optional[str] = None,
        token_id: Optional[str] = None,
        price: Optional[float] = None,
        size: Optional[float] = None,
        notional: Optional[float] = None,
        reason: str = "",
        would_have_traded: bool = False,
        meta: Optional[dict[str, Any]] = None,
    ) -> int:
        with self._conn() as c:
            cur = c.execute(
                """INSERT INTO decisions
                (ts, strategy, market_id, token_id, side, price, size, notional,
                 reason, would_have_traded, meta_json)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    _now(), strategy, market_id, token_id, side,
                    price, size, notional, reason,
                    1 if would_have_traded else 0,
                    json.dumps(meta) if meta else None,
                ),
            )
            return cur.lastrowid

    def record_order(
        self,
        decision_id: Optional[int],
        order_id: str,
        market_id: str,
        token_id: str,
        side: str,
        price: float,
        size: float,
        status: str,
        raw: Optional[dict[str, Any]] = None,
    ) -> None:
        with self._conn() as c:
            c.execute(
                """INSERT OR REPLACE INTO orders
                (ts, decision_id, order_id, market_id, token_id, side, price, size,
                 status, raw_json)
                VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    _now(), decision_id, order_id, market_id, token_id, side,
                    price, size, status,
                    json.dumps(raw) if raw else None,
                ),
            )

    def record_fill(
        self,
        order_id: str,
        market_id: str,
        token_id: str,
        side: str,
        price: float,
        size: float,
        fee: float = 0.0,
        raw: Optional[dict[str, Any]] = None,
    ) -> None:
        with self._conn() as c:
            c.execute(
                """INSERT INTO fills
                (ts, order_id, market_id, token_id, side, price, size, fee, raw_json)
                VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    _now(), order_id, market_id, token_id, side,
                    price, size, fee,
                    json.dumps(raw) if raw else None,
                ),
            )

    def record_halt(self, reason: str) -> None:
        with self._conn() as c:
            c.execute(
                "INSERT INTO halts (ts, reason) VALUES (?, ?)",
                (_now(), reason),
            )

    # ---- reads ----
    def orders_today(self) -> int:
        today = datetime.now(timezone.utc).date().isoformat()
        with self._conn() as c:
            row = c.execute(
                "SELECT COUNT(*) AS n FROM orders WHERE ts >= ? AND status IN ('posted','filled')",
                (today,),
            ).fetchone()
            return int(row["n"] or 0)

    def realized_pnl_today(self) -> float:
        """Signed cashflow from today's fills (SELL adds, BUY subtracts), minus fees."""
        today = datetime.now(timezone.utc).date().isoformat()
        with self._conn() as c:
            rows = c.execute(
                "SELECT side, price, size, fee FROM fills WHERE ts >= ?",
                (today,),
            ).fetchall()
            pnl = 0.0
            for r in rows:
                notional = float(r["price"]) * float(r["size"])
                sign = 1 if r["side"].upper() == "SELL" else -1
                pnl += sign * notional - float(r["fee"] or 0.0)
            return pnl
