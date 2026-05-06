"""Risk checks. Every order passes through `RiskManager.check()` before
reaching the CLOB. If any check fails, the order is rejected and journaled
as a SKIP with a reason.

These are hard, local, deterministic checks. They exist to catch bugs in
the strategy and to bound worst-case loss when you're not watching.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .config import Settings
from .journal import Journal


@dataclass
class RiskVerdict:
    ok: bool
    reason: str = ""


class RiskManager:
    def __init__(self, settings: Settings, journal: Journal):
        self.s = settings
        self.j = journal

    def check(
        self,
        *,
        side: str,
        price: float,
        size: float,
        market_exposure: float,
        total_exposure: float,
        edge: Optional[float] = None,
    ) -> RiskVerdict:
        if self.s.kill_switch_engaged():
            return RiskVerdict(False, f"kill switch file present ({self.s.kill_switch_file})")

        if price <= 0 or price >= 1:
            return RiskVerdict(False, f"price {price} outside (0,1)")

        if size <= 0:
            return RiskVerdict(False, "size must be positive")

        notional = price * size
        if notional > self.s.max_notional_per_order:
            return RiskVerdict(
                False,
                f"order notional {notional:.2f} > MAX_NOTIONAL_PER_ORDER "
                f"{self.s.max_notional_per_order:.2f}",
            )

        if side.upper() == "BUY":
            projected_market = market_exposure + notional
            if projected_market > self.s.max_notional_per_market:
                return RiskVerdict(
                    False,
                    f"market exposure would hit {projected_market:.2f} > "
                    f"MAX_NOTIONAL_PER_MARKET {self.s.max_notional_per_market:.2f}",
                )
            projected_total = total_exposure + notional
            if projected_total > self.s.max_total_exposure:
                return RiskVerdict(
                    False,
                    f"total exposure would hit {projected_total:.2f} > "
                    f"MAX_TOTAL_EXPOSURE {self.s.max_total_exposure:.2f}",
                )

        if self.j.orders_today() >= self.s.max_orders_per_day:
            return RiskVerdict(
                False, f"daily order cap reached ({self.s.max_orders_per_day})"
            )

        realized = self.j.realized_pnl_today()
        if realized <= -abs(self.s.max_daily_loss):
            return RiskVerdict(
                False,
                f"daily loss {realized:.2f} breached MAX_DAILY_LOSS "
                f"{self.s.max_daily_loss:.2f} — halted for today",
            )

        if edge is not None and edge < self.s.min_edge:
            return RiskVerdict(
                False, f"edge {edge:.4f} < MIN_EDGE {self.s.min_edge:.4f}"
            )

        return RiskVerdict(True)
