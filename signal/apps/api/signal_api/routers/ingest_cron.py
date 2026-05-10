"""Optional HTTP trigger for one RSS ingest cycle (UptimeRobot, Render Cron, manual tests)."""
from __future__ import annotations

import logging
import hmac

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException

from signal_api.ai.model_routing import build_llm_routing_matrix
from signal_api.config import get_settings
from signal_api.services import news_ingest

log = logging.getLogger("depth4")

router = APIRouter()


def _require_ingest_secret(x_depth4_ingest_secret: str | None) -> None:
  s = get_settings()
  secret = (s.ingest_cron_secret.get_secret_value() or "").strip()
  if not secret:
    raise HTTPException(
      status_code=503,
      detail="INGEST_CRON_SECRET is not set; this HTTP trigger is disabled.",
    )
  if not x_depth4_ingest_secret or len(x_depth4_ingest_secret) != len(secret):
    raise HTTPException(status_code=401, detail="Invalid ingest secret")
  if not hmac.compare_digest(x_depth4_ingest_secret.encode(), secret.encode()):
    raise HTTPException(status_code=401, detail="Invalid ingest secret")


async def _ingest_cycle_guarded() -> None:
  try:
    await news_ingest.one_cycle()
  except Exception:
    log.exception("cron ingest-once: one_cycle failed")


@router.get("/llm-routing-matrix")
async def llm_routing_matrix(
  x_depth4_ingest_secret: str | None = Header(default=None, alias="X-Depth4-Ingest-Secret"),
) -> dict:
  """Admin/debug: task tier map, model ids, escalation and premium budget env (no secrets)."""
  _require_ingest_secret(x_depth4_ingest_secret)
  return build_llm_routing_matrix(get_settings())


@router.post("/ingest-once")
async def ingest_once(
  background_tasks: BackgroundTasks,
  x_depth4_ingest_secret: str | None = Header(default=None, alias="X-Depth4-Ingest-Secret"),
) -> dict:
  _require_ingest_secret(x_depth4_ingest_secret)
  # Run after the response is sent so reverse-proxy timeouts (Render/Cloudflare) do not
  # kill a long RSS + multi-LLM cycle with HTTP 500.
  background_tasks.add_task(_ingest_cycle_guarded)
  return {
    "ok": True,
    "scheduled": True,
    "note": "Ingest runs in the background; check Render logs for news_ingest lines.",
  }
