"""A deliberately conservative example strategy.

Rule:
  For each candidate market, look at the YES token's order book.
  If the spread is wide enough and the best bid is materially below the
  midpoint (i.e. there's room to post a resting BUY one cent above the
  best bid and still be `min_edge` below mid), emit a small BUY signal.

This is NOT a tested alpha. It is a placeholder that exercises the full
pipeline (market selection -> signal -> risk check -> journal -> optional
order) so you can verify the plumbing before writing real alpha.
"""

from __future__ import annotations

from .base import Signal, Strategy
from ..data import Market


class MispricingStrategy(Strategy):
    name = "mispricing"

    MIN_SPREAD = 0.03  # 3c — skip very tight books
    TICK = 0.01        # Polymarket CLOB tick size

    def generate_signals(self, markets: list[Market]) -> list[Signal]:
        signals: list[Signal] = []
        # size_per_order is derived from the cap so we never intend to breach it
        per_order_size = max(1.0, self.s.max_notional_per_order / 0.5)
        # Note: actual size depends on price; we recompute after we know price.

        for m in markets:
            if not m.tokens:
                continue
            yes = m.tokens[0]
            try:
                book = self.data.get_order_book(yes.token_id)
            except Exception:
                continue

            mid = book.mid()
            spread = book.spread()
            bid = book.best_bid()
            if mid is None or spread is None or bid is None:
                continue
            if spread < self.MIN_SPREAD:
                continue

            our_bid = round(bid[0] + self.TICK, 2)
            if our_bid >= mid:
                continue
            edge = mid - our_bid
            if edge < self.s.min_edge:
                continue

            # Size so that notional ~= max_notional_per_order.
            # (RiskManager will reject if anything is slightly off.)
            target_notional = self.s.max_notional_per_order * 0.9
            size = max(1.0, round(target_notional / max(our_bid, 0.01), 2))

            signals.append(
                Signal(
                    market_id=m.condition_id,
                    token_id=yes.token_id,
                    side="BUY",
                    price=our_bid,
                    size=size,
                    edge=edge,
                    reason=(
                        f"bid={bid[0]:.2f} mid={mid:.2f} spread={spread:.2f} "
                        f"our_bid={our_bid:.2f} edge={edge:.3f}"
                    ),
                )
            )
        return signals
