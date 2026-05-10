"""Optional HTTP trigger for one RSS ingest cycle (UptimeRobot, Render Cron, manual tests)."""
from __future__ import annotations

import logging
import hmac

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, status

from signal_api.ai.depth4_guard import depth4_can_run_background_llm, get_depth4_guard_status
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


def depth4_status_payload() -> dict:
  """Shared JSON for ``/cron/depth4-status`` and ``/admin/depth4-status``."""
  st = get_depth4_guard_status()
  s = get_settings()
  return {
    "enabled": st.enabled,
    "active_users": st.active_users,
    "meets_minimum": st.meets_minimum,
    "min_active_users_for_depth4": s.min_active_users_for_depth4,
    "background_llm_allowed": depth4_can_run_background_llm(),
  }


@router.get("/depth4-status")
async def depth4_status(
  x_depth4_ingest_secret: str | None = Header(default=None, alias="X-Depth4-Ingest-Secret"),
) -> dict:
  """Guard status: DEPTH4 enabled flag, active-user proxy count, whether background LLM is allowed."""
  _require_ingest_secret(x_depth4_ingest_secret)
  return depth4_status_payload()


@router.post("/ingest-once")
async def ingest_once(
  background_tasks: BackgroundTasks,
  x_depth4_ingest_secret: str | None = Header(default=None, alias="X-Depth4-Ingest-Secret"),
) -> dict:
  _require_ingest_secret(x_depth4_ingest_secret)
  if not depth4_can_run_background_llm():
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="DEPTH4 background LLM work is paused (disabled or not enough active users).",
    )
  # Run after the response is sent so reverse-proxy timeouts (Render/Cloudflare) do not
  # kill a long RSS + multi-LLM cycle with HTTP 500.
  background_tasks.add_task(_ingest_cycle_guarded)
  return {
    "ok": True,
    "scheduled": True,
    "note": "Ingest runs in the background; check Render logs for news_ingest lines.",
  }
