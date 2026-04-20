"""Market data helpers.

Uses Polymarket's public Gamma API for market listings/metadata and the
CLOB for order books. No auth needed for reads.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import httpx

from .config import Settings


@dataclass
class OutcomeToken:
    token_id: str
    outcome: str  # e.g. "Yes" / "No"


@dataclass
class Market:
    condition_id: str
    question: str
    slug: str
    active: bool
    closed: bool
    accepting_orders: bool
    tokens: list[OutcomeToken]
    end_date_iso: Optional[str] = None
    tags: list[str] | None = None


@dataclass
class OrderBook:
    token_id: str
    bids: list[tuple[float, float]]  # (price, size) — highest first
    asks: list[tuple[float, float]]  # (price, size) — lowest first

    def best_bid(self) -> Optional[tuple[float, float]]:
        return self.bids[0] if self.bids else None

    def best_ask(self) -> Optional[tuple[float, float]]:
        return self.asks[0] if self.asks else None

    def mid(self) -> Optional[float]:
        b, a = self.best_bid(), self.best_ask()
        if b and a:
            return (b[0] + a[0]) / 2.0
        return None

    def spread(self) -> Optional[float]:
        b, a = self.best_bid(), self.best_ask()
        if b and a:
            return a[0] - b[0]
        return None


class MarketData:
    def __init__(self, settings: Settings):
        self.s = settings
        self._http = httpx.Client(
            timeout=httpx.Timeout(15.0),
            headers={"accept": "application/json"},
            http2=True,
        )

    def close(self) -> None:
        self._http.close()

    # ---------- Gamma ----------
    def list_active_markets(self, limit: int = 100) -> list[Market]:
        url = f"{self.s.polymarket_gamma_host}/markets"
        params = {
            "active": "true",
            "closed": "false",
            "limit": limit,
            "order": "volume24hr",
            "ascending": "false",
        }
        r = self._http.get(url, params=params)
        r.raise_for_status()
        return [self._parse_gamma_market(m) for m in r.json()]

    def get_market(self, condition_id: str) -> Optional[Market]:
        url = f"{self.s.polymarket_gamma_host}/markets"
        r = self._http.get(url, params={"condition_ids": condition_id, "limit": 1})
        r.raise_for_status()
        data = r.json()
        if not data:
            return None
        return self._parse_gamma_market(data[0])

    def _parse_gamma_market(self, m: dict[str, Any]) -> Market:
        import json as _json

        raw_tokens = m.get("clobTokenIds")
        raw_outcomes = m.get("outcomes")
        if isinstance(raw_tokens, str):
            raw_tokens = _json.loads(raw_tokens)
        if isinstance(raw_outcomes, str):
            raw_outcomes = _json.loads(raw_outcomes)
        tokens: list[OutcomeToken] = []
        if raw_tokens and raw_outcomes and len(raw_tokens) == len(raw_outcomes):
            for tid, oc in zip(raw_tokens, raw_outcomes):
                if tid:
                    tokens.append(OutcomeToken(token_id=str(tid), outcome=str(oc)))
        return Market(
            condition_id=str(m.get("conditionId", "")),
            question=str(m.get("question", "")),
            slug=str(m.get("slug", "")),
            active=bool(m.get("active", False)),
            closed=bool(m.get("closed", False)),
            accepting_orders=bool(m.get("acceptingOrders", False)),
            tokens=tokens,
            end_date_iso=m.get("endDate"),
            tags=m.get("tags") or [],
        )

    # ---------- CLOB ----------
    def get_order_book(self, token_id: str) -> OrderBook:
        url = f"{self.s.polymarket_clob_host}/book"
        r = self._http.get(url, params={"token_id": token_id})
        r.raise_for_status()
        data = r.json()
        bids = sorted(
            [(float(b["price"]), float(b["size"])) for b in data.get("bids", [])],
            key=lambda x: -x[0],
        )
        asks = sorted(
            [(float(a["price"]), float(a["size"])) for a in data.get("asks", [])],
            key=lambda x: x[0],
        )
        return OrderBook(token_id=token_id, bids=bids, asks=asks)

    def get_midpoint(self, token_id: str) -> Optional[float]:
        url = f"{self.s.polymarket_clob_host}/midpoint"
        r = self._http.get(url, params={"token_id": token_id})
        if r.status_code != 200:
            return None
        data = r.json()
        mid = data.get("mid")
        return float(mid) if mid is not None else None
