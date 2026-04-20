"""Typer CLI: `polybot run`, `polybot markets`, `polybot status`, `polybot cancel-all`."""

from __future__ import annotations

import typer
from rich.console import Console
from rich.table import Table

from .config import get_settings
from .data import MarketData
from .journal import Journal
from .runner import Runner

app = typer.Typer(add_completion=False, help="polybot — local Polymarket trading bot.")
console = Console()


@app.command()
def run() -> None:
    """Start the main loop (dry-run unless LIVE_TRADING=true in .env)."""
    r = Runner()
    r.run_forever()


@app.command()
def markets(limit: int = 20) -> None:
    """List the top active markets by 24h volume."""
    s = get_settings()
    d = MarketData(s)
    try:
        ms = d.list_active_markets(limit=limit)
    finally:
        d.close()
    table = Table(title=f"Top {len(ms)} active markets")
    table.add_column("condition_id", style="dim")
    table.add_column("question")
    table.add_column("accepting", justify="center")
    table.add_column("tokens", justify="right")
    for m in ms:
        table.add_row(
            m.condition_id[:16] + "…",
            (m.question or m.slug)[:80],
            "Y" if m.accepting_orders else "-",
            str(len(m.tokens)),
        )
    console.print(table)


@app.command()
def book(token_id: str) -> None:
    """Show the current order book for a given outcome token."""
    s = get_settings()
    d = MarketData(s)
    try:
        ob = d.get_order_book(token_id)
    finally:
        d.close()
    console.print(f"[bold]token[/bold] {token_id}")
    mid = ob.mid()
    sp = ob.spread()
    console.print(f"mid={mid}  spread={sp}")
    t = Table(title="Bids (top 10)")
    t.add_column("price"); t.add_column("size")
    for p, sz in ob.bids[:10]:
        t.add_row(f"{p:.3f}", f"{sz:.2f}")
    console.print(t)
    t = Table(title="Asks (top 10)")
    t.add_column("price"); t.add_column("size")
    for p, sz in ob.asks[:10]:
        t.add_row(f"{p:.3f}", f"{sz:.2f}")
    console.print(t)


@app.command()
def status() -> None:
    """Show today's counts from the journal."""
    s = get_settings()
    j = Journal(s.journal_db_path)
    console.print(f"live_trading={s.live_trading}  strategy={s.strategy}")
    console.print(f"orders today: {j.orders_today()}")
    console.print(f"realized PnL today: {j.realized_pnl_today():.2f} USDC")
    console.print(
        f"caps: per-order={s.max_notional_per_order} per-market={s.max_notional_per_market} "
        f"total={s.max_total_exposure} max/day={s.max_orders_per_day} "
        f"max-loss={s.max_daily_loss}"
    )
    console.print(f"kill switch: {'ENGAGED' if s.kill_switch_engaged() else 'clear'} "
                  f"({s.kill_switch_file})")


@app.command("cancel-all")
def cancel_all() -> None:
    """Cancel every open order. Requires LIVE_TRADING=true."""
    s = get_settings()
    if not s.live_trading:
        console.print("[yellow]LIVE_TRADING=false — nothing to cancel (dry-run mode).[/yellow]")
        raise typer.Exit(0)
    from .client import PolyClient
    c = PolyClient(s)
    resp = c.cancel_all()
    console.print(resp)


@app.command()
def kill() -> None:
    """Engage the kill switch (creates the KILL file). The running bot will halt."""
    s = get_settings()
    s.kill_switch_file.parent.mkdir(parents=True, exist_ok=True)
    s.kill_switch_file.touch()
    console.print(f"[red]Kill switch engaged:[/red] {s.kill_switch_file}")


@app.command()
def unkill() -> None:
    """Clear the kill switch."""
    s = get_settings()
    if s.kill_switch_file.exists():
        s.kill_switch_file.unlink()
        console.print(f"cleared {s.kill_switch_file}")
    else:
        console.print("no kill switch file present")


if __name__ == "__main__":
    app()
