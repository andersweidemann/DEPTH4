"""Optional HTTP trigger for one RSS ingest cycle (UptimeRobot, Render Cron, manual tests)."""
from __future__ import annotations

import hmac

from fastapi import APIRouter, Header, HTTPException

from signal_api.config import get_settings
from signal_api.services import news_ingest

router = APIRouter()


@router.post("/ingest-once")
async def ingest_once(
  x_depth4_ingest_secret: str | None = Header(default=None, alias="X-Depth4-Ingest-Secret"),
) -> dict:
  s = get_settings()
  secret = (s.ingest_cron_secret.get_secret_value() or "").strip()
  if not secret:
    raise HTTPException(
      status_code=503,
      detail="INGEST_CRON_SECRET is not set; ingest HTTP trigger is disabled.",
    )
  if not x_depth4_ingest_secret or len(x_depth4_ingest_secret) != len(secret):
    raise HTTPException(status_code=401, detail="Invalid ingest secret")
  if not hmac.compare_digest(x_depth4_ingest_secret.encode(), secret.encode()):
    raise HTTPException(status_code=401, detail="Invalid ingest secret")
  await news_ingest.one_cycle()
  return {"ok": True, "ran": "news_ingest.one_cycle"}
