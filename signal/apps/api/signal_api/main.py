from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware

from signal_api.ai.depth4_guard import get_depth4_guard_status
from signal_api.ai.llm_client import llm_configured, llm_interactive_configured
from signal_api.config import get_settings
from signal_api.jobs import briefing_worker, scenario_refinement
from signal_api.routers import admin_llm_ops, admin_llm_usage, ingest_cron, market_routes, stripe_routes, thesis_draft_expand
from signal_api.routers.ingest_cron import _require_ingest_secret, depth4_status_payload
from signal_api.services import news_ingest

log = logging.getLogger("depth4")


@asynccontextmanager
async def lifespan(_app: FastAPI):
  s = get_settings()
  t1: asyncio.Task[None] | None = None
  t2: asyncio.Task[None] | None = None
  t3: asyncio.Task[None] | None = None
  t4: asyncio.Task[None] | None = None
  if s.supabase_url and s.supabase_service_key.get_secret_value():
    ru = (s.redis_url or "").lower()
    if os.getenv("RENDER") and ("localhost" in ru or "127.0.0.1" in ru):
      log.warning(
        "DEPTH4: REDIS_URL points at localhost — Render has no local Redis. "
        "Set REDIS_URL to Upstash or Render Redis (rediss://…). Dedup is fail-open until then."
      )
    log.info(
      "DEPTH4 API starting, redis=%s, llm_provider=%s, llm_background=%r, llm_interactive=%r, "
      "background_configured=%s interactive_configured=%s background_loops=%s",
      s.redis_url and s.redis_url[:24],
      (s.llm_provider or "anthropic").lower(),
      (s.llm_provider_background or "").strip().lower() or "(legacy classify/analysis)",
      (s.llm_provider_interactive or "anthropic").strip().lower(),
      llm_configured(),
      llm_interactive_configured(),
      s.enable_background_llm_loops,
    )
    if s.enable_background_llm_loops:
      t1 = asyncio.create_task(news_ingest.rss_loop())
      t2 = asyncio.create_task(briefing_worker.run_loop())
      t3 = asyncio.create_task(news_ingest.yahoo_ticker_ingest_loop())
      t4 = asyncio.create_task(scenario_refinement.run_loop())
    else:
      log.info(
        "DEPTH4: ENABLE_BACKGROUND_LLM_LOOPS=false — no RSS/Yahoo/briefing/refinement timers; "
        "use /cron/ingest-once or POST /market/ingest-session when you want work to run.",
      )
  else:
    log.warning("DEPTH4 API: no Supabase; background workers off")
  try:
    yield
  finally:
    for t in (t1, t2, t3, t4):
      if t:
        t.cancel()
        try:
          await t
        except Exception:
          pass


app = FastAPI(title="DEPTH4", version="0.1.0", lifespan=lifespan)
app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

app.include_router(stripe_routes.router, prefix="/webhooks", tags=["billing"])
app.include_router(market_routes.router, prefix="/market", tags=["market"])
app.include_router(ingest_cron.router, prefix="/cron", tags=["cron"])
app.include_router(thesis_draft_expand.router, prefix="/user", tags=["user"])

_admin = APIRouter(prefix="/admin", tags=["admin"])


@_admin.get("/depth4-status")
def admin_depth4_status(
  x_depth4_ingest_secret: str | None = Header(default=None, alias="X-Depth4-Ingest-Secret"),
) -> dict:
  """Same payload as ``GET /cron/depth4-status``; protect with ``X-Depth4-Ingest-Secret`` (or edge ACL)."""
  _require_ingest_secret(x_depth4_ingest_secret)
  return depth4_status_payload()


_admin.include_router(admin_llm_usage.router)
_admin.include_router(admin_llm_ops.router)

app.include_router(_admin)


@app.get("/healthz")
def healthz() -> dict:
  s = get_settings()
  g = get_depth4_guard_status()
  return {
    "ok": True,
    "service": "depth4-api",
    "background_llm_loops": s.enable_background_llm_loops,
    "depth4_enabled": g.enabled,
    "depth4_active_users": g.active_users,
    "depth4_background_llm_ok": g.enabled and g.meets_minimum,
  }


if __name__ == "__main__":
  import uvicorn

  uvicorn.run("signal_api.main:app", host="0.0.0.0", port=8_000, reload=True)
