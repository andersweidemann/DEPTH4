from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from signal_api.config import get_settings
from signal_api.jobs import briefing_worker, scenario_refinement
from signal_api.routers import market_routes, stripe_routes
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
    log.info("DEPTH4 API starting, redis=%s", s.redis_url and s.redis_url[:24])
    t1 = asyncio.create_task(news_ingest.rss_loop())
    t2 = asyncio.create_task(briefing_worker.run_loop())
    t3 = asyncio.create_task(news_ingest.yahoo_ticker_ingest_loop())
    t4 = asyncio.create_task(scenario_refinement.run_loop())
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


@app.get("/healthz")
def healthz() -> dict:
  return {"ok": True, "service": "depth4-api"}


if __name__ == "__main__":
  import uvicorn

  uvicorn.run("signal_api.main:app", host="0.0.0.0", port=8_000, reload=True)
