from __future__ import annotations

from fastapi import APIRouter, Query

from signal_api.services import prices

router = APIRouter()


@router.get("/quote")
async def quote(ticker: str = Query(..., min_length=1)) -> dict:
  parts = [t.strip().upper() for t in ticker.split(",") if t.strip()][:32]
  q = await prices.quote_tickers(parts)
  return {"quotes": q}
