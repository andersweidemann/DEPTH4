"""Environment-driven configuration with strict typing.

All settings are loaded from a local `.env` file (or the process environment).
Secrets (PRIVATE_KEY) never leave this process and are never logged.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Endpoints
    polymarket_clob_host: str = "https://clob.polymarket.com"
    polymarket_gamma_host: str = "https://gamma-api.polymarket.com"
    polymarket_data_host: str = "https://data-api.polymarket.com"

    # Wallet
    chain_id: int = 137
    private_key: Optional[SecretStr] = None
    signature_type: int = 0
    funder: Optional[str] = None

    # Safety switches
    live_trading: bool = False
    kill_switch_file: Path = Path("./data/KILL")

    # Risk caps (USDC)
    max_notional_per_order: float = 2.0
    max_notional_per_market: float = 5.0
    max_total_exposure: float = 25.0
    max_orders_per_day: int = 20
    max_daily_loss: float = 5.0
    min_edge: float = 0.02

    # Runner
    loop_interval_sec: int = 30
    strategy: str = "mispricing"
    markets: str = ""

    # Storage
    journal_db_path: Path = Path("./data/journal.db")
    log_level: str = "INFO"

    @field_validator("live_trading", mode="before")
    @classmethod
    def _strict_bool(cls, v):
        """Only the exact string "true" (case-insensitive) enables live trading.
        Any typo or unexpected value => dry run. This is intentional."""
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.strip().lower() == "true"
        return False

    @field_validator("signature_type")
    @classmethod
    def _sig_type(cls, v):
        if v not in (0, 1, 2):
            raise ValueError("SIGNATURE_TYPE must be 0, 1, or 2")
        return v

    def market_list(self) -> list[str]:
        return [m.strip() for m in self.markets.split(",") if m.strip()]

    def kill_switch_engaged(self) -> bool:
        return self.kill_switch_file.exists()

    def require_keys_for_live(self) -> None:
        """Call before any live action. Raises if misconfigured."""
        if not self.live_trading:
            return
        if not self.private_key or not self.private_key.get_secret_value():
            raise RuntimeError("LIVE_TRADING=true but PRIVATE_KEY is not set")
        if self.signature_type in (1, 2) and not self.funder:
            raise RuntimeError(
                "SIGNATURE_TYPE is 1 or 2 (proxy wallet) but FUNDER is not set. "
                "Set FUNDER to your Polymarket deposit address."
            )


_cached: Optional[Settings] = None


def get_settings() -> Settings:
    global _cached
    if _cached is None:
        _cached = Settings()
    return _cached
