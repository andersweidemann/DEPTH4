"""Base strategy interface.

A strategy is a pure function over market state that returns a list of
desired `Signal`s. It never sends orders itself — the runner does that
after the risk checks pass.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

from ..config import Settings
from ..data import Market, MarketData


@dataclass
class Signal:
    market_id: str
    token_id: str
    side: str  # "BUY" or "SELL"
    price: float
    size: float
    edge: float  # in price units (0..1)
    reason: str = ""


class Strategy(ABC):
    name: str = "base"

    def __init__(self, settings: Settings, data: MarketData):
        self.s = settings
        self.data = data

    @abstractmethod
    def generate_signals(self, markets: list[Market]) -> list[Signal]:
        ...

    def pick_markets(self) -> list[Market]:
        """Default market selection: the configured whitelist, or the top
        active markets by 24h volume."""
        wl = self.s.market_list()
        if wl:
            out: list[Market] = []
            for cid in wl:
                m = self.data.get_market(cid)
                if m:
                    out.append(m)
            return out
        # Fallback: top-N by volume, but filter for open/accepting-orders.
        markets = self.data.list_active_markets(limit=50)
        return [m for m in markets if m.accepting_orders and not m.closed and m.tokens]
