"""Live watcher: poll target wallets' /activity and alert on new trades."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import httpx
from rich.console import Console
from rich.text import Text

from .api import PolymarketClient
from .config import settings
from .db import connect, get_watcher_state, init_db, set_watcher_state

console = Console()


def _fmt_trade(t: dict[str, Any], wallet_label: str) -> Text:
    ts = int(t.get("timestamp") or 0)
    when = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%H:%M:%S UTC")
    side = (t.get("side") or "").upper()
    side_style = "green" if side == "BUY" else "red"
    size = float(t.get("size") or 0)
    price = float(t.get("price") or 0)
    usdc = float(t.get("usdcSize") or size * price)
    outcome = t.get("outcome") or "?"
    title = t.get("title") or t.get("slug") or "?"

    line = Text()
    line.append(f"[{when}] ", style="dim")
    line.append(f"{wallet_label} ", style="cyan")
    line.append(f"{side} ", style=side_style)
    line.append(f"{size:,.1f} @ {price:.3f} ", style="bold")
    line.append(f"(${usdc:,.0f}) ", style="yellow")
    line.append(f"{outcome} · ", style="magenta")
    line.append(title)
    return line


async def _alert_webhook(text: str) -> None:
    if not settings.alert_webhook:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            await c.post(settings.alert_webhook, json={"text": text})
    except Exception as e:
        console.log(f"[red]webhook failed: {e}[/]")


async def _poll_wallet(api: PolymarketClient, wallet: str, label: str) -> int:
    with connect() as conn:
        state = get_watcher_state(conn, wallet)
    last_ts = int(state["last_seen_ts"]) if state else 0
    last_hash = state["last_seen_hash"] if state else None

    try:
        recent = await api.activity(wallet, limit=50, offset=0)
    except Exception as e:
        console.log(f"[red]{label} fetch failed: {e}[/]")
        return 0

    trades = [t for t in recent if (t.get("type") or "TRADE") == "TRADE"]
    trades.sort(key=lambda t: int(t.get("timestamp") or 0))
    new = [
        t for t in trades
        if int(t.get("timestamp") or 0) > last_ts
        or (int(t.get("timestamp") or 0) == last_ts and t.get("transactionHash") != last_hash)
    ]
    if not new:
        return 0

    for t in new:
        line = _fmt_trade(t, label)
        console.print(line)
        await _alert_webhook(line.plain)

    newest = new[-1]
    with connect() as conn:
        set_watcher_state(
            conn,
            wallet,
            int(newest.get("timestamp") or 0),
            newest.get("transactionHash"),
        )
    return len(new)


async def watch(
    wallets: list[tuple[str, str]],
    interval: float = 30.0,
    max_loops: int | None = None,
    prime: bool = True,
) -> None:
    """Poll every `interval` seconds. `wallets` = [(address, label), ...].

    If `prime=True`, seed the watcher_state for any unseen wallet so we only
    alert on strictly new trades, not the entire backfill.
    """
    init_db()
    console.rule(f"[bold]Watching {len(wallets)} wallets every {interval:.0f}s[/]")

    async with PolymarketClient() as api:
        if prime:
            for addr, label in wallets:
                with connect() as conn:
                    if get_watcher_state(conn, addr):
                        continue
                try:
                    recent = await api.activity(addr, limit=1, offset=0)
                except Exception:
                    recent = []
                if recent:
                    t = recent[0]
                    with connect() as conn:
                        set_watcher_state(
                            conn,
                            addr,
                            int(t.get("timestamp") or 0),
                            t.get("transactionHash"),
                        )
                console.log(f"primed {label}")

        loop = 0
        while True:
            loop += 1
            results = await asyncio.gather(
                *[_poll_wallet(api, addr, label) for addr, label in wallets],
                return_exceptions=False,
            )
            total_new = sum(results)
            if total_new:
                console.log(f"[dim]loop {loop}: {total_new} new trade(s)[/]")
            if max_loops is not None and loop >= max_loops:
                return
            await asyncio.sleep(interval)
