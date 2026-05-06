"""Rank scored wallets into a leaderboard with sensible filters."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from rich.console import Console
from rich.table import Table

from .db import connect

console = Console()

VALID_SORTS = {
    "total_pnl",
    "realized_pnl",
    "unrealized_pnl",
    "roi",
    "volume_usdc",
    "win_rate",
    "current_value",
    "trades_seen",
    "active_days",
    "last_trade_ts",
}


def query_leaderboard(
    *,
    sort_by: str = "total_pnl",
    min_volume: float = 0.0,
    min_trades: int = 0,
    min_closed: int = 0,
    min_active_days: int = 0,
    min_markets: int = 0,
    top: int = 50,
    direction: str = "desc",
) -> list[dict[str, Any]]:
    if sort_by not in VALID_SORTS:
        raise ValueError(f"sort_by must be one of {sorted(VALID_SORTS)}")
    direction = direction.lower()
    if direction not in {"asc", "desc"}:
        raise ValueError("direction must be asc or desc")

    q = f"""
        SELECT * FROM scores
        WHERE volume_usdc      >= ?
          AND trades_seen      >= ?
          AND closed_positions >= ?
          AND active_days      >= ?
          AND distinct_markets >= ?
        ORDER BY {sort_by} {direction.upper()}
        LIMIT ?
    """
    with connect() as conn:
        rows = conn.execute(
            q,
            (min_volume, min_trades, min_closed, min_active_days, min_markets, top),
        ).fetchall()
    return [dict(r) for r in rows]


def _fmt_usd(x: float | None) -> str:
    if x is None:
        return "-"
    sign = "-" if x < 0 else ""
    v = abs(x)
    if v >= 1_000_000:
        return f"{sign}${v/1_000_000:.2f}M"
    if v >= 1_000:
        return f"{sign}${v/1_000:.1f}k"
    return f"{sign}${v:.0f}"


def _fmt_ts(ts: int | None) -> str:
    if not ts:
        return "-"
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")


def render_leaderboard(rows: list[dict[str, Any]], title: str, wide: bool = False) -> None:
    """Pretty-print a leaderboard. `wide` shows all columns; otherwise a compact view."""
    table = Table(title=title, show_lines=False, expand=False, pad_edge=False)
    table.add_column("#", justify="right", style="dim", width=3)
    table.add_column("Wallet", no_wrap=True, min_width=30)
    table.add_column("Total", justify="right", style="bold", no_wrap=True)
    table.add_column("Realized", justify="right", no_wrap=True)
    table.add_column("Equity", justify="right", no_wrap=True)
    table.add_column("ROI", justify="right", no_wrap=True)
    table.add_column("Vol", justify="right", no_wrap=True)
    table.add_column("Trades", justify="right", no_wrap=True)
    if wide:
        table.add_column("Mkts", justify="right", no_wrap=True)
        table.add_column("Closed", justify="right", no_wrap=True)
        table.add_column("Win%", justify="right", no_wrap=True)
        table.add_column("Days", justify="right", no_wrap=True)
        table.add_column("Last", justify="right", no_wrap=True)

    for i, r in enumerate(rows, 1):
        pnl = r.get("total_pnl") or 0
        pnl_style = "green" if pnl > 0 else ("red" if pnl < 0 else "white")
        realized = r.get("realized_pnl") or 0
        r_style = "green" if realized > 0 else ("red" if realized < 0 else "white")
        pseudo = (r.get("pseudonym") or "").strip()
        wallet_short = r["proxy_wallet"][:6] + "…" + r["proxy_wallet"][-4:]
        if pseudo:
            label = f"[cyan]{pseudo[:20]}[/] [dim]{wallet_short}[/]"
        else:
            label = f"[cyan]{wallet_short}[/]"
        base = [
            str(i),
            label,
            f"[{pnl_style}]{_fmt_usd(pnl)}[/]",
            f"[{r_style}]{_fmt_usd(realized)}[/]",
            _fmt_usd(r.get("current_value")),
            f"{(r.get('roi') or 0) * 100:+.0f}%",
            _fmt_usd(r.get("volume_usdc")),
            str(r.get("trades_seen") or 0),
        ]
        if wide:
            base += [
                str(r.get("distinct_markets") or 0),
                str(r.get("closed_positions") or 0),
                f"{(r.get('win_rate') or 0) * 100:.0f}%",
                str(r.get("active_days") or 0),
                _fmt_ts(r.get("last_trade_ts")),
            ]
        table.add_row(*base)
    console.print(table)


def dump_json(rows: list[dict[str, Any]]) -> None:
    import json

    console.print_json(data=rows)
