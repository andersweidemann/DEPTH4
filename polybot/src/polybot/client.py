"""Thin wrapper around py_clob_client for order placement.

We intentionally keep this minimal and explicit. Every method that can send
funds:
1. Requires LIVE_TRADING=true,
2. Re-checks the kill switch,
3. Returns the raw CLOB response for journaling.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from .config import Settings

log = logging.getLogger(__name__)


class PolyClient:
    """Wraps py_clob_client. Lazily constructed so dry-run can work without
    a private key configured."""

    def __init__(self, settings: Settings):
        self.s = settings
        self._client = None  # type: ignore[assignment]

    def _ensure_client(self):
        if self._client is not None:
            return self._client

        self.s.require_keys_for_live()

        # Import lazily so the test suite / dry run doesn't require the dep.
        from py_clob_client.client import ClobClient
        from py_clob_client.clob_types import ApiCreds

        pk = self.s.private_key.get_secret_value() if self.s.private_key else None
        if not pk:
            raise RuntimeError("PRIVATE_KEY is not set; cannot construct CLOB client")

        client = ClobClient(
            host=self.s.polymarket_clob_host,
            key=pk,
            chain_id=self.s.chain_id,
            signature_type=self.s.signature_type,
            funder=self.s.funder or None,
        )

        # Derive or create L2 (API) credentials for order signing.
        try:
            creds: ApiCreds = client.create_or_derive_api_creds()
            client.set_api_creds(creds)
        except Exception as e:  # pragma: no cover — network dependent
            log.error("Failed to derive CLOB API credentials: %s", e)
            raise

        self._client = client
        return client

    # ---- read-only helpers (no auth needed, but CLOB client supports them) ----
    def midpoint(self, token_id: str) -> Optional[float]:
        c = self._ensure_client()
        r = c.get_midpoint(token_id)
        return float(r["mid"]) if r and "mid" in r else None

    # ---- order placement ----
    def place_limit_order(
        self,
        *,
        token_id: str,
        side: str,  # "BUY" or "SELL"
        price: float,
        size: float,
        post_only: bool = True,
    ) -> dict[str, Any]:
        """Post a single limit order. Caller must already have passed RiskManager.check()."""
        if not self.s.live_trading:
            raise RuntimeError("place_limit_order called with LIVE_TRADING=false")
        if self.s.kill_switch_engaged():
            raise RuntimeError("kill switch engaged — refusing to place order")

        from py_clob_client.clob_types import OrderArgs, OrderType
        from py_clob_client.order_builder.constants import BUY, SELL

        c = self._ensure_client()
        side_const = BUY if side.upper() == "BUY" else SELL
        order_args = OrderArgs(
            token_id=token_id,
            price=float(price),
            size=float(size),
            side=side_const,
        )
        signed = c.create_order(order_args)
        order_type = OrderType.GTC  # post-only GTC; expires on cancel
        resp = c.post_order(signed, order_type)
        return resp or {}

    def cancel_order(self, order_id: str) -> dict[str, Any]:
        if not self.s.live_trading:
            raise RuntimeError("cancel_order called with LIVE_TRADING=false")
        c = self._ensure_client()
        return c.cancel(order_id) or {}

    def cancel_all(self) -> dict[str, Any]:
        """Emergency: cancel every open order across every market."""
        if not self.s.live_trading:
            raise RuntimeError("cancel_all called with LIVE_TRADING=false")
        c = self._ensure_client()
        return c.cancel_all() or {}

    def open_orders(self) -> list[dict[str, Any]]:
        c = self._ensure_client()
        return list(c.get_orders() or [])

    def positions_notional(self) -> dict[str, float]:
        """Return {token_id: notional_usdc} for currently held positions.
        Uses the Data API (more reliable than CLOB for portfolio views).
        """
        import httpx

        address = None
        client = self._ensure_client()
        try:
            address = client.get_address()
        except Exception:
            pass
        if not address:
            return {}
        url = f"{self.s.polymarket_data_host}/positions"
        r = httpx.get(url, params={"user": address}, timeout=15.0)
        if r.status_code != 200:
            return {}
        out: dict[str, float] = {}
        for p in r.json() or []:
            tid = str(p.get("asset", ""))
            size = float(p.get("size", 0) or 0)
            price = float(p.get("curPrice", p.get("price", 0)) or 0)
            if tid and size:
                out[tid] = out.get(tid, 0.0) + size * price
        return out
