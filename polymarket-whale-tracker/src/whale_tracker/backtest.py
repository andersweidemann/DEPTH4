"""Copy-trade backtester.

    "If I had mirrored this wallet's trades starting N days ago with $X seed
     capital, what would my PnL be today?"

## Model

- Chronological replay of every BUY/SELL event in the whale's `/activity`
  TRADE stream between `start_ts` and `end_ts`.
- Position sizing: per-trade USDC = min(whale_usdc * copy_ratio,
  seed_capital * max_per_trade_pct, available_cash).
- Slippage: we assume we fill at the whale's observed price plus/minus a
  configurable haircut (bps). This is a coarse proxy for latency + adverse
  selection.
- SELL sizing: we sell min(our_shares, whale_sold_shares * copy_ratio) of
  the asset the whale sold. If we don't hold the asset, we skip.
- Redemptions / resolutions are handled at the end via
  `markets_by_conditions`: for each asset we still hold, we look up the
  market's current `outcomePrices` (which is $1/$0 for resolved markets,
  current mid for live ones) and mark-to-market.
- No funding, no gas (Polymarket has 0% trading fees; gas on Polygon is
  sub-cent).

Outputs a compact report plus a per-trade log you can dump to JSON for
deeper analysis.
"""
from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from rich.console import Console
from rich.table import Table

from .api import PolymarketClient
from .pnl import _fetch_activity_all_types

console = Console()


@dataclass
class BacktestParams:
    wallet: str
    start_ts: int
    end_ts: int
    seed_usdc: float = 1000.0
    copy_ratio: float = 0.01
    max_per_trade_pct: float = 0.10
    slippage_bps: float = 50.0
    min_trade_usdc: float = 1.0


@dataclass
class Position:
    asset: str
    condition_id: str
    outcome: str
    shares: float = 0.0
    usdc_cost: float = 0.0
    title: str = ""
    outcome_index: int | None = None


@dataclass
class SimTrade:
    ts: int
    side: str
    asset: str
    condition_id: str
    outcome: str
    whale_price: float
    whale_usdc: float
    my_price: float
    my_usdc: float
    my_shares: float
    cash_after: float
    note: str = ""


@dataclass
class BacktestResult:
    params: BacktestParams
    final_cash: float
    final_equity: float
    total_pnl: float
    roi: float
    copied_trades: int
    skipped_trades: int
    whale_trades_in_window: int
    open_positions: list[Position]
    resolved_wins: int
    resolved_losses: int
    resolved_unknown: int
    trades: list[SimTrade] = field(default_factory=list)


async def run_backtest(api: PolymarketClient, p: BacktestParams) -> BacktestResult:
    # 1. Pull full whale activity (TRADE events are all we need for replay).
    activity = await _fetch_activity_all_types(api, p.wallet)
    trades = [
        ev for ev in activity
        if (ev.get("type") == "TRADE")
        and p.start_ts <= int(ev.get("timestamp") or 0) <= p.end_ts
    ]
    trades.sort(key=lambda t: int(t.get("timestamp") or 0))
    whale_trades_in_window = len(trades)

    cash = p.seed_usdc
    positions: dict[str, Position] = {}
    log: list[SimTrade] = []
    copied = 0
    skipped = 0
    slip = p.slippage_bps / 10_000.0

    for ev in trades:
        side = (ev.get("side") or "").upper()
        asset = ev.get("asset") or ""
        if not asset or side not in {"BUY", "SELL"}:
            continue
        whale_price = float(ev.get("price") or 0.0)
        whale_size = float(ev.get("size") or 0.0)  # shares
        whale_usdc = float(ev.get("usdcSize") or whale_size * whale_price)
        cond = ev.get("conditionId") or ""
        outcome = ev.get("outcome") or ""
        title = ev.get("title") or ""
        ts = int(ev.get("timestamp") or 0)

        if side == "BUY":
            fill_price = max(min(whale_price * (1 + slip), 0.999999), 0.000001)
            target_usdc = min(
                whale_usdc * p.copy_ratio,
                p.seed_usdc * p.max_per_trade_pct,
                cash,
            )
            if target_usdc < p.min_trade_usdc:
                skipped += 1
                log.append(
                    SimTrade(ts, side, asset, cond, outcome, whale_price, whale_usdc,
                             fill_price, 0, 0, cash, "skipped:min_trade_usdc")
                )
                continue
            shares = target_usdc / fill_price
            cash -= target_usdc
            pos = positions.setdefault(
                asset,
                Position(asset=asset, condition_id=cond, outcome=outcome, title=title,
                         outcome_index=ev.get("outcomeIndex")),
            )
            pos.shares += shares
            pos.usdc_cost += target_usdc
            copied += 1
            log.append(SimTrade(ts, side, asset, cond, outcome, whale_price, whale_usdc,
                                fill_price, target_usdc, shares, cash))
        else:  # SELL
            pos = positions.get(asset)
            if not pos or pos.shares <= 0:
                skipped += 1
                log.append(SimTrade(ts, side, asset, cond, outcome, whale_price, whale_usdc,
                                    whale_price, 0, 0, cash, "skipped:no_position"))
                continue
            fill_price = max(min(whale_price * (1 - slip), 0.999999), 0.000001)
            sell_shares = min(pos.shares, whale_size * p.copy_ratio)
            if sell_shares <= 0:
                skipped += 1
                continue
            proceeds = sell_shares * fill_price
            cost_basis = pos.usdc_cost * (sell_shares / pos.shares) if pos.shares else 0
            cash += proceeds
            pos.shares -= sell_shares
            pos.usdc_cost -= cost_basis
            copied += 1
            log.append(SimTrade(ts, side, asset, cond, outcome, whale_price, whale_usdc,
                                fill_price, proceeds, sell_shares, cash))

    # 2. Mark-to-market remaining positions via Gamma market data.
    held = [p_ for p_ in positions.values() if p_.shares > 1e-8]
    cond_ids = list({p_.condition_id for p_ in held if p_.condition_id})
    markets = await api.markets_by_conditions(cond_ids) if cond_ids else {}

    resolved_wins = 0
    resolved_losses = 0
    resolved_unknown = 0
    equity_from_positions = 0.0

    for pos in held:
        m = markets.get(pos.condition_id)
        mark_price = 0.0
        if m:
            clob_ids = _to_list(m.get("clobTokenIds"))
            outcome_prices = [float(x) for x in _to_list(m.get("outcomePrices"))]
            idx = None
            if pos.asset in clob_ids:
                idx = clob_ids.index(pos.asset)
            elif pos.outcome_index is not None and 0 <= pos.outcome_index < len(outcome_prices):
                idx = pos.outcome_index
            if idx is not None and idx < len(outcome_prices):
                mark_price = outcome_prices[idx]
            closed = bool(m.get("closed"))
            if closed:
                if mark_price >= 0.99:
                    resolved_wins += 1
                elif mark_price <= 0.01:
                    resolved_losses += 1
                else:
                    resolved_unknown += 1  # voided / unusual resolution
        else:
            resolved_unknown += 1
        equity_from_positions += pos.shares * mark_price

    final_equity = cash + equity_from_positions
    total_pnl = final_equity - p.seed_usdc
    roi = total_pnl / p.seed_usdc if p.seed_usdc else 0.0

    return BacktestResult(
        params=p,
        final_cash=round(cash, 4),
        final_equity=round(final_equity, 4),
        total_pnl=round(total_pnl, 4),
        roi=roi,
        copied_trades=copied,
        skipped_trades=skipped,
        whale_trades_in_window=whale_trades_in_window,
        open_positions=held,
        resolved_wins=resolved_wins,
        resolved_losses=resolved_losses,
        resolved_unknown=resolved_unknown,
        trades=log,
    )


def _to_list(val: Any) -> list[Any]:
    """Polymarket sometimes returns JSON-encoded arrays as strings."""
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        import json

        try:
            v = json.loads(val)
            return v if isinstance(v, list) else []
        except Exception:
            return []
    return []


# --------------------------------------------------------------------- reporting


def _fmt_usd(x: float | None) -> str:
    if x is None:
        return "-"
    sign = "-" if x < 0 else ""
    v = abs(x)
    if v >= 1_000_000:
        return f"{sign}${v / 1_000_000:.2f}M"
    if v >= 1_000:
        return f"{sign}${v / 1_000:.1f}k"
    if v >= 10:
        return f"{sign}${v:.0f}"
    return f"{sign}${v:.2f}"


def render_result(r: BacktestResult, *, show_trades: int = 0) -> None:
    p = r.params
    start = datetime.fromtimestamp(p.start_ts, tz=timezone.utc).strftime("%Y-%m-%d")
    end = datetime.fromtimestamp(p.end_ts, tz=timezone.utc).strftime("%Y-%m-%d")
    pnl_style = "green" if r.total_pnl > 0 else ("red" if r.total_pnl < 0 else "white")

    table = Table(
        title=f"Backtest {p.wallet[:10]}… · {start} → {end}",
        show_header=False,
        pad_edge=False,
        expand=False,
    )
    table.add_column("k", style="dim")
    table.add_column("v", style="bold")
    table.add_row("seed capital", _fmt_usd(p.seed_usdc))
    table.add_row("copy_ratio", f"{p.copy_ratio * 100:.2f}% of whale size")
    table.add_row("max per trade", f"{p.max_per_trade_pct * 100:.1f}% of seed")
    table.add_row("slippage", f"{p.slippage_bps:.0f} bps")
    table.add_row("whale trades in window", f"{r.whale_trades_in_window}")
    table.add_row("trades copied", f"{r.copied_trades}")
    table.add_row("trades skipped", f"{r.skipped_trades}")
    table.add_row("", "")
    table.add_row("cash at end", _fmt_usd(r.final_cash))
    table.add_row("open positions value", _fmt_usd(r.final_equity - r.final_cash))
    table.add_row("final equity", _fmt_usd(r.final_equity))
    table.add_row("[bold]TOTAL PnL[/]", f"[{pnl_style}]{_fmt_usd(r.total_pnl)}[/]")
    table.add_row("[bold]ROI[/]", f"[{pnl_style}]{r.roi * 100:+.1f}%[/]")
    if r.open_positions:
        table.add_row("", "")
        table.add_row(
            "open positions",
            f"{len(r.open_positions)} "
            f"(resolved wins {r.resolved_wins} / losses {r.resolved_losses} "
            f"/ voided/unknown {r.resolved_unknown})",
        )
    console.print(table)

    if show_trades > 0 and r.trades:
        tt = Table(title=f"Last {show_trades} simulated fills", expand=False)
        for col in ("time", "side", "mkt", "outcome", "whale $", "my $", "price", "shares"):
            tt.add_column(col, no_wrap=True)
        for t in r.trades[-show_trades:]:
            tt.add_row(
                datetime.fromtimestamp(t.ts, tz=timezone.utc).strftime("%m-%d %H:%M"),
                t.side,
                (t.condition_id[:10] + "…") if t.condition_id else "-",
                (t.outcome or "-")[:10],
                _fmt_usd(t.whale_usdc),
                _fmt_usd(t.my_usdc),
                f"{t.my_price:.3f}",
                f"{t.my_shares:.1f}",
            )
        console.print(tt)


# ------------------------------------------------------------ batch screener


@dataclass
class ScreenRow:
    wallet: str
    pseudonym: str | None
    result: BacktestResult | Exception


async def screen_top(
    wallets: list[tuple[str, str | None]],
    params_template: BacktestParams,
    concurrency: int = 4,
) -> list[ScreenRow]:
    """Run the same backtest over many wallets. Returns per-wallet results."""
    sem = asyncio.Semaphore(concurrency)
    rows: list[ScreenRow] = []

    async with PolymarketClient() as api:
        async def worker(wallet: str, pseudo: str | None) -> None:
            async with sem:
                p = BacktestParams(
                    wallet=wallet,
                    start_ts=params_template.start_ts,
                    end_ts=params_template.end_ts,
                    seed_usdc=params_template.seed_usdc,
                    copy_ratio=params_template.copy_ratio,
                    max_per_trade_pct=params_template.max_per_trade_pct,
                    slippage_bps=params_template.slippage_bps,
                    min_trade_usdc=params_template.min_trade_usdc,
                )
                try:
                    r = await run_backtest(api, p)
                    rows.append(ScreenRow(wallet, pseudo, r))
                except Exception as e:
                    rows.append(ScreenRow(wallet, pseudo, e))

        await asyncio.gather(*(worker(w, pn) for w, pn in wallets))

    return rows


def render_screen(rows: list[ScreenRow]) -> None:
    ok = [r for r in rows if isinstance(r.result, BacktestResult)]
    ok.sort(key=lambda r: r.result.total_pnl, reverse=True)

    t = Table(title=f"Copy-trade backtest · {len(ok)}/{len(rows)} wallets", expand=False)
    t.add_column("#", style="dim", justify="right")
    t.add_column("Wallet", no_wrap=True)
    t.add_column("PnL", justify="right", style="bold", no_wrap=True)
    t.add_column("ROI", justify="right", no_wrap=True)
    t.add_column("Equity", justify="right", no_wrap=True)
    t.add_column("Copied", justify="right", no_wrap=True)
    t.add_column("Skip", justify="right", no_wrap=True)
    t.add_column("Wins/Loss", justify="right", no_wrap=True)

    for i, row in enumerate(ok, 1):
        r = row.result
        pnl_style = "green" if r.total_pnl > 0 else ("red" if r.total_pnl < 0 else "white")
        pseudo = (row.pseudonym or "").strip()[:18]
        wshort = row.wallet[:6] + "…" + row.wallet[-4:]
        label = f"[cyan]{pseudo}[/] [dim]{wshort}[/]" if pseudo else f"[cyan]{wshort}[/]"
        t.add_row(
            str(i),
            label,
            f"[{pnl_style}]{_fmt_usd(r.total_pnl)}[/]",
            f"[{pnl_style}]{r.roi * 100:+.0f}%[/]",
            _fmt_usd(r.final_equity),
            str(r.copied_trades),
            str(r.skipped_trades),
            f"{r.resolved_wins}/{r.resolved_losses}",
        )
    console.print(t)

    errs = [r for r in rows if not isinstance(r.result, BacktestResult)]
    if errs:
        console.print(f"[yellow]{len(errs)} wallet(s) errored:[/]")
        for e in errs[:5]:
            console.print(f"  {e.wallet}: {e.result}")


def parse_start_end(days: int | None, start: str | None, end: str | None) -> tuple[int, int]:
    now = int(time.time())
    if days is not None:
        return now - days * 86400, now
    fmt_choices = ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S")

    def _parse(s: str) -> int:
        for f in fmt_choices:
            try:
                return int(
                    datetime.strptime(s, f).replace(tzinfo=timezone.utc).timestamp()
                )
            except ValueError:
                continue
        raise ValueError(f"Cannot parse date {s!r} — use YYYY-MM-DD")

    s = _parse(start) if start else now - 30 * 86400
    e = _parse(end) if end else now
    return s, e
