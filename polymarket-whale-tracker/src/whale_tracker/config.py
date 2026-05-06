"""Runtime configuration loaded from env + sensible defaults."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    data_api: str = os.getenv("POLYMARKET_DATA_API", "https://data-api.polymarket.com")
    gamma_api: str = os.getenv("POLYMARKET_GAMMA_API", "https://gamma-api.polymarket.com")
    clob_api: str = os.getenv("POLYMARKET_CLOB_API", "https://clob.polymarket.com")
    db_path: Path = Path(os.getenv("WHALES_DB_PATH", "./data/whales.db"))
    rate_limit_rps: float = float(os.getenv("WHALES_RATE_LIMIT_RPS", "20"))
    alert_webhook: str | None = os.getenv("WHALES_ALERT_WEBHOOK")

    def ensure_dirs(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_dirs()
