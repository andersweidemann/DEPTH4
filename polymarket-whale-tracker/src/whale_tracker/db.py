"""SQLite storage for trades, wallets, and scoring snapshots."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable, Iterator

from .config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS trades (
    transaction_hash TEXT NOT NULL,
    asset            TEXT NOT NULL,
    proxy_wallet     TEXT NOT NULL,
    side             TEXT NOT NULL,
    size             REAL NOT NULL,
    price            REAL NOT NULL,
    usdc_size        REAL,
    timestamp        INTEGER NOT NULL,
    condition_id     TEXT NOT NULL,
    outcome          TEXT,
    outcome_index    INTEGER,
    title            TEXT,
    event_slug       TEXT,
    pseudonym        TEXT,
    PRIMARY KEY (transaction_hash, asset, side, size, price)
);
CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(proxy_wallet);
CREATE INDEX IF NOT EXISTS idx_trades_ts     ON trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_cond   ON trades(condition_id);

CREATE TABLE IF NOT EXISTS wallets (
    proxy_wallet     TEXT PRIMARY KEY,
    pseudonym        TEXT,
    first_seen_ts    INTEGER,
    last_seen_ts     INTEGER,
    trade_count      INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scores (
    proxy_wallet        TEXT PRIMARY KEY,
    pseudonym           TEXT,
    scored_at           INTEGER NOT NULL,
    trades_seen         INTEGER,
    volume_usdc         REAL,
    realized_pnl        REAL,
    unrealized_pnl      REAL,
    total_pnl           REAL,
    current_value       REAL,
    open_positions      INTEGER,
    closed_positions    INTEGER,
    win_rate            REAL,
    avg_trade_usdc      REAL,
    first_trade_ts      INTEGER,
    last_trade_ts       INTEGER,
    active_days         INTEGER,
    roi                 REAL,
    distinct_markets    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_scores_total ON scores(total_pnl);
CREATE INDEX IF NOT EXISTS idx_scores_vol   ON scores(volume_usdc);

CREATE TABLE IF NOT EXISTS watcher_state (
    proxy_wallet     TEXT PRIMARY KEY,
    last_seen_ts     INTEGER NOT NULL,
    last_seen_hash   TEXT
);
"""


def _connect(path: Path | None = None) -> sqlite3.Connection:
    p = path or settings.db_path
    p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(p, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


@contextmanager
def connect(path: Path | None = None) -> Iterator[sqlite3.Connection]:
    conn = _connect(path)
    try:
        yield conn
    finally:
        conn.close()


def init_db(path: Path | None = None) -> None:
    with connect(path) as conn:
        conn.executescript(SCHEMA)


# ---------------------------------------------------------------------- writes


def upsert_trades(conn: sqlite3.Connection, trades: Iterable[dict[str, Any]]) -> int:
    """Insert trades (ignoring duplicates) and refresh wallet stats."""
    rows = []
    wallets: dict[str, dict[str, Any]] = {}
    for t in trades:
        wallet = (t.get("proxyWallet") or "").lower()
        if not wallet:
            continue
        ts = int(t.get("timestamp") or 0)
        size = float(t.get("size") or 0.0)
        price = float(t.get("price") or 0.0)
        usdc = t.get("usdcSize")
        usdc_size = float(usdc) if usdc is not None else size * price
        rows.append(
            (
                t.get("transactionHash") or "",
                t.get("asset") or "",
                wallet,
                (t.get("side") or "").upper(),
                size,
                price,
                usdc_size,
                ts,
                t.get("conditionId") or "",
                t.get("outcome"),
                t.get("outcomeIndex"),
                t.get("title"),
                t.get("eventSlug"),
                t.get("pseudonym"),
            )
        )
        w = wallets.setdefault(
            wallet,
            {
                "pseudonym": t.get("pseudonym"),
                "first": ts,
                "last": ts,
                "count": 0,
            },
        )
        w["first"] = min(w["first"], ts) if w["first"] else ts
        w["last"] = max(w["last"], ts)
        w["count"] += 1
        if t.get("pseudonym"):
            w["pseudonym"] = t["pseudonym"]

    if not rows:
        return 0

    with conn:
        conn.executemany(
            """
            INSERT OR IGNORE INTO trades
            (transaction_hash, asset, proxy_wallet, side, size, price, usdc_size,
             timestamp, condition_id, outcome, outcome_index, title, event_slug, pseudonym)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            rows,
        )
        for wallet, w in wallets.items():
            conn.execute(
                """
                INSERT INTO wallets (proxy_wallet, pseudonym, first_seen_ts, last_seen_ts, trade_count)
                VALUES (?,?,?,?,?)
                ON CONFLICT(proxy_wallet) DO UPDATE SET
                    pseudonym     = COALESCE(excluded.pseudonym, wallets.pseudonym),
                    first_seen_ts = MIN(wallets.first_seen_ts, excluded.first_seen_ts),
                    last_seen_ts  = MAX(wallets.last_seen_ts,  excluded.last_seen_ts),
                    trade_count   = wallets.trade_count + excluded.trade_count
                """,
                (wallet, w["pseudonym"], w["first"], w["last"], w["count"]),
            )
    return len(rows)


def upsert_score(conn: sqlite3.Connection, score: dict[str, Any]) -> None:
    cols = [
        "proxy_wallet",
        "pseudonym",
        "scored_at",
        "trades_seen",
        "volume_usdc",
        "realized_pnl",
        "unrealized_pnl",
        "total_pnl",
        "current_value",
        "open_positions",
        "closed_positions",
        "win_rate",
        "avg_trade_usdc",
        "first_trade_ts",
        "last_trade_ts",
        "active_days",
        "roi",
        "distinct_markets",
    ]
    placeholders = ",".join("?" * len(cols))
    updates = ",".join(f"{c}=excluded.{c}" for c in cols if c != "proxy_wallet")
    with conn:
        conn.execute(
            f"INSERT INTO scores ({','.join(cols)}) VALUES ({placeholders}) "
            f"ON CONFLICT(proxy_wallet) DO UPDATE SET {updates}",
            [score.get(c) for c in cols],
        )


# ----------------------------------------------------------------------- reads


def list_candidate_wallets(
    conn: sqlite3.Connection, *, min_trades: int = 1, limit: int | None = None
) -> list[sqlite3.Row]:
    q = "SELECT * FROM wallets WHERE trade_count >= ? ORDER BY trade_count DESC"
    params: list[Any] = [min_trades]
    if limit:
        q += " LIMIT ?"
        params.append(limit)
    return list(conn.execute(q, params))


def get_watcher_state(conn: sqlite3.Connection, wallet: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM watcher_state WHERE proxy_wallet = ?", (wallet,)
    ).fetchone()


def set_watcher_state(
    conn: sqlite3.Connection, wallet: str, ts: int, tx_hash: str | None
) -> None:
    with conn:
        conn.execute(
            """
            INSERT INTO watcher_state (proxy_wallet, last_seen_ts, last_seen_hash)
            VALUES (?,?,?)
            ON CONFLICT(proxy_wallet) DO UPDATE SET
                last_seen_ts = excluded.last_seen_ts,
                last_seen_hash = excluded.last_seen_hash
            """,
            (wallet, ts, tx_hash),
        )
