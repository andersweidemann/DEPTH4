"""Async Polymarket Data / Gamma API client with polite rate limiting.

Everything here is public; no auth needed.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from .config import settings


class EndOfData(Exception):
    """Raised when the API signals there's nothing more to paginate (HTTP 400 at deep offsets)."""


class RateLimiter:
    """Simple token-bucket-ish limiter: at most `rps` starts per second."""

    def __init__(self, rps: float) -> None:
        self._min_interval = 1.0 / max(rps, 0.001)
        self._lock = asyncio.Lock()
        self._next_allowed = 0.0

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            wait = self._next_allowed - now
            if wait > 0:
                await asyncio.sleep(wait)
            self._next_allowed = max(now, self._next_allowed) + self._min_interval


class PolymarketClient:
    """Thin wrapper over the public Polymarket HTTP APIs."""

    def __init__(self, rps: float | None = None) -> None:
        self._limiter = RateLimiter(rps or settings.rate_limit_rps)
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            headers={"User-Agent": "polymarket-whale-tracker/0.1"},
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "PolymarketClient":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.close()

    async def _get(
        self,
        url: str,
        params: dict[str, Any] | list[tuple[str, Any]] | None = None,
    ) -> Any:
        await self._limiter.acquire()
        for attempt in range(5):
            try:
                r = await self._client.get(url, params=params)
                if r.status_code == 429:
                    await asyncio.sleep(1.5 * (attempt + 1))
                    continue
                # 400 from Polymarket typically means "offset too deep" — treat as end of data.
                if r.status_code == 400:
                    raise EndOfData(f"{url} returned 400 ({r.text[:120]})")
                r.raise_for_status()
                return r.json()
            except EndOfData:
                raise
            except (httpx.TimeoutException, httpx.HTTPStatusError, httpx.ReadError) as e:
                if attempt == 4:
                    raise RuntimeError(f"GET {url} failed after retries: {e}") from e
                await asyncio.sleep(0.5 * (2**attempt))
        raise RuntimeError(f"GET {url} exhausted retries")

    # ------------------------------------------------------------------ trades

    async def trades(
        self,
        *,
        limit: int = 500,
        offset: int = 0,
        market: str | None = None,
        user: str | None = None,
    ) -> list[dict[str, Any]]:
        """Public trade tape. Newest first."""
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if market:
            params["market"] = market
        if user:
            params["user"] = user
        try:
            data = await self._get(f"{settings.data_api}/trades", params)
        except EndOfData:
            return []
        return data if isinstance(data, list) else []

    async def iter_trades(
        self, *, pages: int = 50, per_page: int = 500, start_offset: int = 0
    ):
        """Yield pages of the trade tape, stopping on empty/end-of-data page."""
        for i in range(pages):
            batch = await self.trades(limit=per_page, offset=start_offset + i * per_page)
            if not batch:
                return
            yield batch
            if len(batch) < per_page:
                return

    # --------------------------------------------------------------- positions

    async def positions(
        self, user: str, *, limit: int = 500, offset: int = 0
    ) -> list[dict[str, Any]]:
        try:
            data = await self._get(
                f"{settings.data_api}/positions",
                {"user": user, "limit": limit, "offset": offset},
            )
        except EndOfData:
            return []
        return data if isinstance(data, list) else []

    async def closed_positions(
        self, user: str, *, limit: int = 500, offset: int = 0
    ) -> list[dict[str, Any]]:
        try:
            data = await self._get(
                f"{settings.data_api}/closed-positions",
                {"user": user, "limit": limit, "offset": offset},
            )
        except EndOfData:
            return []
        return data if isinstance(data, list) else []

    async def activity(
        self,
        user: str,
        *,
        limit: int = 500,
        offset: int = 0,
        type: str | None = None,
    ) -> list[dict[str, Any]]:
        """Per-wallet activity stream.

        Polymarket's default (no type filter) returns only TRADE + MERGE events.
        To see REDEEM, REWARD, etc., you MUST pass the `type` filter explicitly.
        Valid types: TRADE, SPLIT, MERGE, REDEEM, REWARD, CONVERSION, DEPOSIT,
        WITHDRAWAL, YIELD, MAKER_REBATE, REFERRAL_REWARD.
        """
        params: dict[str, Any] = {"user": user, "limit": limit, "offset": offset}
        if type is not None:
            params["type"] = type
        try:
            data = await self._get(f"{settings.data_api}/activity", params)
        except EndOfData:
            return []
        return data if isinstance(data, list) else []

    async def value(self, user: str) -> float:
        try:
            data = await self._get(f"{settings.data_api}/value", {"user": user})
        except EndOfData:
            return 0.0
        if isinstance(data, list) and data:
            return float(data[0].get("value") or 0.0)
        return 0.0

    # ----------------------------------------------------------------- markets

    async def market(self, condition_id: str) -> dict[str, Any] | None:
        """Fetch a single market by condition id (includes closed/resolved)."""
        try:
            data = await self._get(
                f"{settings.gamma_api}/markets",
                {"condition_ids": condition_id, "closed": "true", "limit": 1},
            )
        except (RuntimeError, EndOfData):
            return None
        if isinstance(data, list) and data:
            return data[0]
        return None

    async def markets_by_conditions(
        self, condition_ids: list[str], *, chunk: int = 50
    ) -> dict[str, dict[str, Any]]:
        """Batch-fetch markets (BOTH open and resolved) keyed by conditionId.

        Gamma's `closed=true` filter is exclusive (closed-only), and the
        default is open-only. So we fire two parallel queries per batch and
        merge.
        """
        result: dict[str, dict[str, Any]] = {}
        uniq = list(dict.fromkeys(c for c in condition_ids if c))

        async def _fetch(batch: list[str], closed: bool | None) -> list[dict[str, Any]]:
            params: list[tuple[str, str]] = [("condition_ids", c) for c in batch]
            if closed is not None:
                params.append(("closed", "true" if closed else "false"))
            params.append(("limit", str(max(len(batch) * 2, 100))))
            try:
                data = await self._get(f"{settings.gamma_api}/markets", params)
            except (RuntimeError, EndOfData):
                return []
            return data if isinstance(data, list) else []

        for i in range(0, len(uniq), chunk):
            batch = uniq[i : i + chunk]
            open_markets, closed_markets = await asyncio.gather(
                _fetch(batch, closed=False),
                _fetch(batch, closed=True),
            )
            for m in list(open_markets) + list(closed_markets):
                cid = m.get("conditionId")
                if cid and cid not in result:
                    result[cid] = m
        return result
