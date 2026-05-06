"""Per-wallet PnL scoring from Polymarket's public endpoints.

We use a **cashflow PnL** approach, which is the only honest one available
from public data:

    total_pnl = (current portfolio value)
              + Σ USDC received (SELL + REDEEM + REWARD + MAKER_REBATE
                                 + REFERRAL_REWARD + YIELD)
              - Σ USDC spent    (BUY)

Why not use `/closed-positions`? That endpoint returns **only winning
resolved positions** — losses are invisible. Using it to compute realized
PnL systematically overstates performance. Redemptions that paid zero
(losing positions) only appear in `/activity?type=REDEEM` with
`usdcSize=0`.

Win rate is computed per `conditionId`: for every market the wallet has
touched and fully closed out (no current open position), sum the net USDC
cashflow; if positive it's counted as a win.
"""
from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from typing import Any

from rich.console import Console
from rich.progress import (
    BarColumn,
    Progress,
    SpinnerColumn,
    TaskProgressColumn,
    TextColumn,
)

from .api import PolymarketClient
from .db import connect, init_db, list_candidate_wallets, upsert_score

console = Console()

# Activity event types that represent USDC inflow to the wallet
INFLOW_TYPES = {"REDEEM", "REWARD", "MAKER_REBATE", "REFERRAL_REWARD", "YIELD"}
# Types we need to pull explicitly (default /activity returns only TRADE + MERGE)
EXTRA_TYPES = ("REDEEM", "REWARD", "MAKER_REBATE", "REFERRAL_REWARD")


async def _fetch_all(
    fetcher, user: str, *, per_page: int = 500, max_pages: int = 20, **kwargs
) -> list[dict[str, Any]]:
    """Paginate `fetcher(user, limit, offset, **kwargs)` until exhausted."""
    out: list[dict[str, Any]] = []
    for i in range(max_pages):
        batch = await fetcher(user, limit=per_page, offset=i * per_page, **kwargs)
        if not batch:
            break
        out.extend(batch)
        if len(batch) < per_page:
            break
    return out


async def _fetch_activity_all_types(api: PolymarketClient, user: str) -> list[dict[str, Any]]:
    """Fetch trades (default stream) + explicit REDEEM/REWARD/etc."""
    default = _fetch_all(api.activity, user, per_page=500, max_pages=40)
    extras = [
        _fetch_all(api.activity, user, per_page=500, max_pages=10, type=t)
        for t in EXTRA_TYPES
    ]
    results = await asyncio.gather(default, *extras)
    seen_hashes: set[tuple[str, str]] = set()
    merged: list[dict[str, Any]] = []
    for batch in results:
        for ev in batch:
            key = (ev.get("transactionHash") or "", ev.get("type") or "")
            if key in seen_hashes and key[0]:
                continue
            seen_hashes.add(key)
            merged.append(ev)
    return merged


def _score_wallet(
    wallet: str,
    pseudonym: str | None,
    open_positions: list[dict[str, Any]],
    activity: list[dict[str, Any]],
    current_value: float,
) -> dict[str, Any]:
    usdc_in = 0.0   # money the wallet took out (SELL proceeds + redemptions + rewards)
    usdc_out = 0.0  # money the wallet put in (BUY cost)
    trade_count = 0
    redeem_count = 0
    volume = 0.0
    timestamps: list[int] = []
    by_market_cash: dict[str, float] = defaultdict(float)
    distinct_markets: set[str] = set()

    for ev in activity:
        etype = ev.get("type") or "TRADE"
        ts = int(ev.get("timestamp") or 0)
        usdc = float(ev.get("usdcSize") or 0.0)
        cond = ev.get("conditionId") or ""
        if cond:
            distinct_markets.add(cond)
        if ts:
            timestamps.append(ts)

        if etype == "TRADE":
            trade_count += 1
            volume += usdc
            side = (ev.get("side") or "").upper()
            if side == "BUY":
                usdc_out += usdc
                if cond:
                    by_market_cash[cond] -= usdc
            elif side == "SELL":
                usdc_in += usdc
                if cond:
                    by_market_cash[cond] += usdc
        elif etype in INFLOW_TYPES:
            usdc_in += usdc
            if cond:
                by_market_cash[cond] += usdc
            if etype == "REDEEM":
                redeem_count += 1
        # MERGE, SPLIT, CONVERSION, DEPOSIT, WITHDRAWAL — no trading PnL impact

    realized_cashflow = usdc_in - usdc_out  # net USDC withdrawn from trading
    total_pnl = realized_cashflow + current_value
    roi = total_pnl / usdc_out if usdc_out > 0 else 0.0

    open_conds = {p.get("conditionId") for p in open_positions if p.get("conditionId")}
    closed_markets = [c for c in by_market_cash if c not in open_conds]
    wins = sum(1 for c in closed_markets if by_market_cash[c] > 0)
    closed_count = len(closed_markets)
    win_rate = wins / closed_count if closed_count else 0.0

    first_ts = min(timestamps) if timestamps else None
    last_ts = max(timestamps) if timestamps else None
    active_days = (
        max(1, round((last_ts - first_ts) / 86400))
        if first_ts and last_ts and last_ts > first_ts
        else (1 if timestamps else 0)
    )
    avg_trade = volume / trade_count if trade_count else 0.0

    return {
        "proxy_wallet": wallet,
        "pseudonym": pseudonym,
        "scored_at": int(time.time()),
        "trades_seen": trade_count,
        "volume_usdc": round(volume, 2),
        "realized_pnl": round(realized_cashflow, 2),
        "unrealized_pnl": round(current_value, 2),
        "total_pnl": round(total_pnl, 2),
        "current_value": round(current_value, 2),
        "open_positions": len(open_positions),
        "closed_positions": closed_count,
        "win_rate": round(win_rate, 4),
        "avg_trade_usdc": round(avg_trade, 2),
        "first_trade_ts": first_ts,
        "last_trade_ts": last_ts,
        "active_days": active_days,
        "roi": round(roi, 4),
        "distinct_markets": len(distinct_markets),
    }


async def score_wallet(
    api: PolymarketClient, wallet: str, pseudonym: str | None
) -> dict[str, Any]:
    opens, activity, val = await asyncio.gather(
        _fetch_all(api.positions, wallet, max_pages=10),
        _fetch_activity_all_types(api, wallet),
        api.value(wallet),
    )
    return _score_wallet(wallet, pseudonym, opens, activity, val)


async def score_all(
    *,
    min_trades: int = 2,
    max_wallets: int | None = None,
    concurrency: int = 8,
) -> int:
    """Score every wallet currently in the local DB meeting `min_trades`."""
    init_db()
    with connect() as conn:
        candidates = list_candidate_wallets(conn, min_trades=min_trades, limit=max_wallets)
    if not candidates:
        console.print("[yellow]No candidate wallets. Run `whales discover` first.[/]")
        return 0

    sem = asyncio.Semaphore(concurrency)
    scored = 0

    async with PolymarketClient() as api:
        async def worker(row) -> None:
            nonlocal scored
            async with sem:
                try:
                    score = await score_wallet(api, row["proxy_wallet"], row["pseudonym"])
                except Exception as e:  # don't let one bad wallet kill the batch
                    console.log(f"[red]skip {row['proxy_wallet']}: {e}[/]")
                    progress.update(task_id, advance=1)
                    return
                with connect() as conn:
                    upsert_score(conn, score)
                scored += 1
                progress.update(task_id, advance=1)

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            console=console,
        ) as progress:
            task_id = progress.add_task(
                f"scoring {len(candidates)} wallets", total=len(candidates)
            )
            await asyncio.gather(*(worker(c) for c in candidates))

    return scored
