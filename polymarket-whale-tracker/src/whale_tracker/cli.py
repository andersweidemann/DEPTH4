"""`whales` — the CLI entry point."""
from __future__ import annotations

import asyncio

import typer
from rich.console import Console

from .api import PolymarketClient
from .backtest import (
    BacktestParams,
    parse_start_end,
    render_result,
    render_screen,
    run_backtest,
    screen_top,
)
from .db import connect, init_db
from .discover import discover as run_discover
from .leaderboard import VALID_SORTS, dump_json, query_leaderboard, render_leaderboard
from .pnl import score_all, score_wallet
from .watcher import watch as run_watch

app = typer.Typer(
    add_completion=False,
    help="Polymarket whale tracker: discover, rank, and monitor profitable wallets.",
    no_args_is_help=True,
)
console = Console()


@app.command()
def init() -> None:
    """Create the local SQLite cache."""
    init_db()
    console.print("[green]database initialized[/]")


@app.command()
def stats() -> None:
    """Show how much data is cached locally."""
    from datetime import datetime, timezone

    init_db()
    with connect() as conn:
        trades = conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
        wallets = conn.execute("SELECT COUNT(*) FROM wallets").fetchone()[0]
        scored = conn.execute("SELECT COUNT(*) FROM scores").fetchone()[0]
        first_trade = conn.execute("SELECT MIN(timestamp) FROM trades").fetchone()[0]
        last_trade = conn.execute("SELECT MAX(timestamp) FROM trades").fetchone()[0]
        scored_at = conn.execute("SELECT MAX(scored_at) FROM scores").fetchone()[0]
        active_wallets = conn.execute("SELECT COUNT(*) FROM wallets WHERE trade_count >= 5").fetchone()[0]
        top_pnl = conn.execute(
            "SELECT pseudonym, proxy_wallet, total_pnl FROM scores ORDER BY total_pnl DESC LIMIT 1"
        ).fetchone()

    def _fmt(ts):
        if not ts:
            return "-"
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    from rich.table import Table

    t = Table(title="Whale tracker cache", show_header=False, pad_edge=False, expand=False)
    t.add_column("k", style="dim")
    t.add_column("v", style="bold")
    t.add_row("trades cached", f"{trades:,}")
    t.add_row("wallets seen", f"{wallets:,}")
    t.add_row("wallets with >=5 trades", f"{active_wallets:,}")
    t.add_row("wallets scored", f"{scored:,}")
    t.add_row("oldest trade ts", _fmt(first_trade))
    t.add_row("newest trade ts", _fmt(last_trade))
    t.add_row("last score run", _fmt(scored_at))
    if top_pnl:
        pseudo = top_pnl["pseudonym"] or top_pnl["proxy_wallet"][:10]
        t.add_row("top wallet by PnL", f"{pseudo} (${top_pnl['total_pnl']:,.0f})")
    console.print(t)


@app.command()
def discover(
    pages: int = typer.Option(200, help="Number of 500-trade pages to pull from /trades."),
    per_page: int = typer.Option(500, help="Page size (max 500)."),
    offset: int = typer.Option(0, help="Start offset (for resuming deeper scans)."),
) -> None:
    """Pull recent trades and harvest active wallets."""
    result = asyncio.run(run_discover(pages=pages, per_page=per_page, start_offset=offset))
    console.print(
        f"[green]stored {result['trades']} trade rows, saw {result['wallets']} distinct wallets[/]"
    )


@app.command()
def score(
    min_trades: int = typer.Option(2, help="Only score wallets with at least N cached trades."),
    max_wallets: int = typer.Option(None, help="Hard cap on wallets to score this run."),
    concurrency: int = typer.Option(8, help="Parallel wallet workers."),
) -> None:
    """Compute PnL/activity scorecards for every known wallet."""
    n = asyncio.run(
        score_all(min_trades=min_trades, max_wallets=max_wallets, concurrency=concurrency)
    )
    console.print(f"[green]scored {n} wallets[/]")


@app.command()
def rank(
    by: str = typer.Option("total_pnl", help=f"Sort by one of: {sorted(VALID_SORTS)}"),
    top: int = typer.Option(25, help="Rows to show."),
    min_volume: float = typer.Option(1000.0, help="Min lifetime USDC volume."),
    min_trades: int = typer.Option(10, help="Min trades."),
    min_closed: int = typer.Option(5, help="Min closed positions (resolved markets)."),
    min_active_days: int = typer.Option(7, help="Min active days between first and last trade."),
    min_markets: int = typer.Option(3, help="Min distinct markets touched."),
    direction: str = typer.Option("desc", help="asc or desc"),
    wide: bool = typer.Option(False, "--wide", help="Show all columns."),
    json_out: bool = typer.Option(False, "--json", help="Dump rows as JSON instead of a table."),
) -> None:
    """Show the leaderboard."""
    rows = query_leaderboard(
        sort_by=by,
        min_volume=min_volume,
        min_trades=min_trades,
        min_closed=min_closed,
        min_active_days=min_active_days,
        min_markets=min_markets,
        top=top,
        direction=direction,
    )
    if not rows:
        console.print("[yellow]No wallets match those filters. Try loosening them, or run `whales score`.[/]")
        return
    if json_out:
        dump_json(rows)
        return
    title = f"Top {len(rows)} by {by} — vol>=${min_volume:,.0f}, trades>={min_trades}, closed>={min_closed}"
    render_leaderboard(rows, title, wide=wide)


@app.command()
def wallet(
    address: str = typer.Argument(..., help="0x… proxy wallet address."),
    refresh: bool = typer.Option(True, help="Re-score the wallet live before printing."),
) -> None:
    """Inspect a single wallet."""
    addr = address.lower()

    async def _run():
        async with PolymarketClient() as api:
            pseudo = None
            with connect() as conn:
                row = conn.execute(
                    "SELECT pseudonym FROM wallets WHERE proxy_wallet = ?", (addr,)
                ).fetchone()
                if row:
                    pseudo = row["pseudonym"]
            if refresh:
                s = await score_wallet(api, addr, pseudo)
                from .db import upsert_score
                with connect() as conn:
                    upsert_score(conn, s)
                return s
            with connect() as conn:
                row = conn.execute(
                    "SELECT * FROM scores WHERE proxy_wallet = ?", (addr,)
                ).fetchone()
                return dict(row) if row else None

    s = asyncio.run(_run())
    if not s:
        console.print(f"[yellow]no data for {addr}[/]")
        raise typer.Exit(1)
    render_leaderboard([s], title=f"Wallet {addr}")


@app.command()
def watch(
    top: int = typer.Option(10, help="Watch the top-N wallets from the current leaderboard."),
    by: str = typer.Option("total_pnl", help="Leaderboard sort key for selecting watchlist."),
    min_volume: float = typer.Option(10_000.0, help="Leaderboard min volume filter."),
    min_trades: int = typer.Option(20, help="Leaderboard min trades filter."),
    min_closed: int = typer.Option(10, help="Leaderboard min closed positions filter."),
    interval: float = typer.Option(30.0, help="Polling interval, seconds."),
    extra: list[str] = typer.Option(
        None,
        "--wallet",
        "-w",
        help="Additional wallet addresses to watch (repeatable).",
    ),
    loops: int = typer.Option(None, help="Stop after N polling loops (default: run forever)."),
    no_prime: bool = typer.Option(False, help="Alert on backfill instead of only new trades."),
) -> None:
    """Stream new trades from the top whales."""
    rows = query_leaderboard(
        sort_by=by,
        min_volume=min_volume,
        min_trades=min_trades,
        min_closed=min_closed,
        min_active_days=0,
        min_markets=0,
        top=top,
        direction="desc",
    )
    wallets = [
        (r["proxy_wallet"], r.get("pseudonym") or r["proxy_wallet"][:10])
        for r in rows
    ]
    for addr in extra or []:
        wallets.append((addr.lower(), addr[:10]))
    if not wallets:
        console.print("[yellow]No wallets to watch — build a leaderboard first or pass -w.[/]")
        raise typer.Exit(1)
    asyncio.run(run_watch(wallets, interval=interval, max_loops=loops, prime=not no_prime))


@app.command()
def backtest(
    address: str = typer.Argument(..., help="0x… wallet to copy-trade."),
    days: int = typer.Option(30, help="How many days back to start copying."),
    start: str = typer.Option(None, help="Explicit start date YYYY-MM-DD (overrides --days)."),
    end: str = typer.Option(None, help="Explicit end date YYYY-MM-DD (defaults to now)."),
    seed: float = typer.Option(1000.0, help="Seed USDC capital."),
    copy_ratio: float = typer.Option(
        0.01, help="Fraction of whale's trade USDC to mirror (0.01 = 1%)."
    ),
    max_per_trade: float = typer.Option(
        0.10, help="Cap a single trade at this fraction of seed capital."
    ),
    slippage_bps: float = typer.Option(50.0, help="Adverse slippage per fill, in bps."),
    min_trade: float = typer.Option(1.0, help="Skip trades smaller than this (USDC)."),
    show_trades: int = typer.Option(0, help="Print the last N simulated fills."),
    json_out: bool = typer.Option(False, "--json", help="Emit JSON instead of a table."),
) -> None:
    """Replay a whale's trades with a seed capital and report hypothetical PnL."""
    start_ts, end_ts = parse_start_end(
        days if not (start or end) else None, start, end
    )
    p = BacktestParams(
        wallet=address.lower(),
        start_ts=start_ts,
        end_ts=end_ts,
        seed_usdc=seed,
        copy_ratio=copy_ratio,
        max_per_trade_pct=max_per_trade,
        slippage_bps=slippage_bps,
        min_trade_usdc=min_trade,
    )

    async def _run():
        async with PolymarketClient() as api:
            return await run_backtest(api, p)

    r = asyncio.run(_run())
    if json_out:
        import json

        console.print_json(
            data={
                "wallet": p.wallet,
                "start_ts": p.start_ts,
                "end_ts": p.end_ts,
                "seed": p.seed_usdc,
                "copy_ratio": p.copy_ratio,
                "final_cash": r.final_cash,
                "final_equity": r.final_equity,
                "total_pnl": r.total_pnl,
                "roi": r.roi,
                "copied_trades": r.copied_trades,
                "skipped_trades": r.skipped_trades,
                "whale_trades_in_window": r.whale_trades_in_window,
                "open_positions": len(r.open_positions),
                "resolved_wins": r.resolved_wins,
                "resolved_losses": r.resolved_losses,
                "resolved_unknown": r.resolved_unknown,
            }
        )
        return
    render_result(r, show_trades=show_trades)


@app.command("backtest-top")
def backtest_top(
    top: int = typer.Option(10, help="Test the top-N wallets from the leaderboard."),
    by: str = typer.Option("total_pnl", help="Leaderboard sort key."),
    min_volume: float = typer.Option(10_000.0),
    min_trades: int = typer.Option(50),
    min_closed: int = typer.Option(10),
    min_active_days: int = typer.Option(14),
    min_markets: int = typer.Option(10),
    days: int = typer.Option(30),
    seed: float = typer.Option(1000.0),
    copy_ratio: float = typer.Option(0.01),
    max_per_trade: float = typer.Option(0.10),
    slippage_bps: float = typer.Option(50.0),
    min_trade: float = typer.Option(1.0),
    concurrency: int = typer.Option(4),
) -> None:
    """Screen: pick the top-N wallets by scorecard, then copy-trade each."""
    rows = query_leaderboard(
        sort_by=by,
        min_volume=min_volume,
        min_trades=min_trades,
        min_closed=min_closed,
        min_active_days=min_active_days,
        min_markets=min_markets,
        top=top,
        direction="desc",
    )
    if not rows:
        console.print("[yellow]No wallets match those filters.[/]")
        raise typer.Exit(1)

    start_ts, end_ts = parse_start_end(days, None, None)
    template = BacktestParams(
        wallet="",
        start_ts=start_ts,
        end_ts=end_ts,
        seed_usdc=seed,
        copy_ratio=copy_ratio,
        max_per_trade_pct=max_per_trade,
        slippage_bps=slippage_bps,
        min_trade_usdc=min_trade,
    )
    targets = [(r["proxy_wallet"], r.get("pseudonym")) for r in rows]
    console.print(
        f"[dim]Backtesting {len(targets)} wallets over last {days}d, "
        f"seed=${seed:.0f}, copy={copy_ratio * 100:.2f}%, slip={slippage_bps:.0f}bps[/]"
    )
    results = asyncio.run(screen_top(targets, template, concurrency=concurrency))
    render_screen(results)


if __name__ == "__main__":
    app()
