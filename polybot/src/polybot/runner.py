"""Main loop.

Flow per tick:
    1. Halt if kill switch is on.
    2. Load markets (whitelist or top active).
    3. Ask the strategy for signals.
    4. For each signal: compute current exposure, run RiskManager.check().
    5. If dry-run: journal a would-be decision.
       If live: submit order via PolyClient, journal the order + response.
"""

from __future__ import annotations

import logging
import signal
import time
from typing import Optional

from rich.console import Console
from rich.logging import RichHandler

from .client import PolyClient
from .config import Settings, get_settings
from .data import MarketData
from .journal import Journal
from .risk import RiskManager
from .strategies import REGISTRY


console = Console()


def setup_logging(level: str) -> None:
    logging.basicConfig(
        level=level.upper(),
        format="%(message)s",
        datefmt="[%X]",
        handlers=[RichHandler(console=console, rich_tracebacks=True, show_path=False)],
    )


log = logging.getLogger("polybot.runner")


class Runner:
    def __init__(self, settings: Optional[Settings] = None):
        self.s = settings or get_settings()
        setup_logging(self.s.log_level)
        self.journal = Journal(self.s.journal_db_path)
        self.data = MarketData(self.s)
        self.risk = RiskManager(self.s, self.journal)
        strat_cls = REGISTRY.get(self.s.strategy)
        if strat_cls is None:
            raise RuntimeError(
                f"Unknown STRATEGY={self.s.strategy!r}. "
                f"Known: {sorted(REGISTRY)}"
            )
        self.strategy = strat_cls(self.s, self.data)
        self.client = PolyClient(self.s) if self.s.live_trading else None
        self._stop = False

    def _install_signal_handlers(self) -> None:
        def _handler(signum, _frame):
            log.warning("signal %s received — will stop after this tick", signum)
            self._stop = True

        signal.signal(signal.SIGINT, _handler)
        signal.signal(signal.SIGTERM, _handler)

    def _current_exposure(self) -> tuple[dict[str, float], float]:
        if not self.client:
            return {}, 0.0
        try:
            per_market = self.client.positions_notional()
        except Exception as e:
            log.warning("could not fetch positions: %s", e)
            per_market = {}
        return per_market, sum(per_market.values())

    def tick(self) -> None:
        if self.s.kill_switch_engaged():
            reason = f"kill switch file present ({self.s.kill_switch_file})"
            log.error(reason)
            self.journal.record_halt(reason)
            self._stop = True
            return

        try:
            markets = self.strategy.pick_markets()
        except Exception as e:
            log.exception("pick_markets failed: %s", e)
            return

        log.info("loaded %d markets", len(markets))

        try:
            signals = self.strategy.generate_signals(markets)
        except Exception as e:
            log.exception("generate_signals failed: %s", e)
            return

        if not signals:
            log.info("no signals this tick")
            return

        positions, total_exposure = self._current_exposure()

        for sig in signals:
            market_exp = positions.get(sig.token_id, 0.0)
            verdict = self.risk.check(
                side=sig.side,
                price=sig.price,
                size=sig.size,
                market_exposure=market_exp,
                total_exposure=total_exposure,
                edge=sig.edge,
            )
            notional = sig.price * sig.size

            if not verdict.ok:
                self.journal.record_decision(
                    strategy=self.strategy.name,
                    side="SKIP",
                    market_id=sig.market_id,
                    token_id=sig.token_id,
                    price=sig.price,
                    size=sig.size,
                    notional=notional,
                    reason=f"risk: {verdict.reason} | signal: {sig.reason}",
                    would_have_traded=False,
                )
                log.info("SKIP %s %s @%.2f x%.2f — %s",
                         sig.side, sig.market_id[:10], sig.price, sig.size, verdict.reason)
                continue

            decision_id = self.journal.record_decision(
                strategy=self.strategy.name,
                side=sig.side,
                market_id=sig.market_id,
                token_id=sig.token_id,
                price=sig.price,
                size=sig.size,
                notional=notional,
                reason=sig.reason,
                would_have_traded=True,
                meta={"edge": sig.edge},
            )

            if not self.s.live_trading or self.client is None:
                log.info(
                    "[DRY-RUN] would %s %s @%.3f x%.2f (notional %.2f, edge %.3f)",
                    sig.side, sig.market_id[:10], sig.price, sig.size, notional, sig.edge,
                )
                continue

            try:
                resp = self.client.place_limit_order(
                    token_id=sig.token_id,
                    side=sig.side,
                    price=sig.price,
                    size=sig.size,
                    post_only=True,
                )
                order_id = str(resp.get("orderID") or resp.get("id") or "")
                status = str(resp.get("status") or "posted")
                self.journal.record_order(
                    decision_id=decision_id,
                    order_id=order_id or f"pending-{decision_id}",
                    market_id=sig.market_id,
                    token_id=sig.token_id,
                    side=sig.side,
                    price=sig.price,
                    size=sig.size,
                    status=status,
                    raw=resp,
                )
                positions[sig.token_id] = market_exp + notional
                total_exposure += notional
                log.info(
                    "[LIVE] posted %s %s @%.3f x%.2f id=%s status=%s",
                    sig.side, sig.market_id[:10], sig.price, sig.size, order_id, status,
                )
            except Exception as e:
                log.exception("order placement failed: %s", e)
                self.journal.record_order(
                    decision_id=decision_id,
                    order_id=f"error-{decision_id}",
                    market_id=sig.market_id,
                    token_id=sig.token_id,
                    side=sig.side,
                    price=sig.price,
                    size=sig.size,
                    status=f"rejected: {e}",
                )

    def run_forever(self) -> None:
        self._install_signal_handlers()
        mode = "LIVE" if self.s.live_trading else "DRY-RUN"
        log.warning("polybot starting in %s mode — strategy=%s interval=%ds",
                    mode, self.s.strategy, self.s.loop_interval_sec)
        if self.s.live_trading:
            log.warning("LIVE trading is enabled. Caps: per-order=%.2f "
                        "per-market=%.2f total=%.2f max-orders/day=%d max-loss=%.2f",
                        self.s.max_notional_per_order, self.s.max_notional_per_market,
                        self.s.max_total_exposure, self.s.max_orders_per_day,
                        self.s.max_daily_loss)
        while not self._stop:
            start = time.time()
            try:
                self.tick()
            except Exception as e:
                log.exception("tick crashed: %s", e)
            elapsed = time.time() - start
            sleep_for = max(1.0, self.s.loop_interval_sec - elapsed)
            for _ in range(int(sleep_for)):
                if self._stop:
                    break
                time.sleep(1)
        log.warning("polybot stopped cleanly")
