"""Harvest active wallets from the public trade tape."""
from __future__ import annotations

from rich.console import Console

from .api import PolymarketClient
from .db import connect, init_db, upsert_trades

console = Console()


async def discover(pages: int = 200, per_page: int = 500, start_offset: int = 0) -> dict:
    """Pull recent trades from /trades and stream them into SQLite.

    Each page covers ~500 trades; at Polymarket's typical tape rate this is a
    rolling window of the last several hours. For a deeper scan use `--pages`
    higher or run this on a schedule.
    """
    init_db()
    total_trades = 0
    total_wallets: set[str] = set()

    async with PolymarketClient() as api:
        with connect() as conn:
            async for batch in api.iter_trades(
                pages=pages, per_page=per_page, start_offset=start_offset
            ):
                n = upsert_trades(conn, batch)
                total_trades += n
                for t in batch:
                    w = (t.get("proxyWallet") or "").lower()
                    if w:
                        total_wallets.add(w)
                console.log(
                    f"+{n} trades  (cum: {total_trades} trades, "
                    f"{len(total_wallets)} wallets)"
                )

    return {"trades": total_trades, "wallets": len(total_wallets)}
