"""Internal LLM usage aggregates (Supabase ``llm_usage_stats``)."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Header, HTTPException, Query, status

from signal_api.db import supabase_admin
from signal_api.routers.ingest_cron import _require_ingest_secret

router = APIRouter()


@router.get("/llm-usage")
def get_llm_usage_summary(
  days: int = Query(7, ge=1, le=90),
  x_depth4_ingest_secret: str | None = Header(default=None, alias="X-Depth4-Ingest-Secret"),
) -> dict:
  """Aggregated LLM usage for the last ``days`` UTC calendar days (inclusive of today)."""
  _require_ingest_secret(x_depth4_ingest_secret)
  end_date = date.today()
  start_date = end_date - timedelta(days=days - 1)
  try:
    sb = supabase_admin()
    r = (
      sb.table("llm_usage_stats")
      .select(
        "date,task_type,provider,model,tier,calls,input_tokens,output_tokens,"
        "escalations,validation_failures,estimated_cost_usd"
      )
      .gte("date", start_date.isoformat())
      .lte("date", end_date.isoformat())
      .order("date", desc=False)
      .execute()
    )
  except Exception as e:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail=f"Failed to load llm_usage_stats: {e!s}",
    ) from e

  rows_raw = r.data or []

  def row_key(x: dict) -> tuple:
    return (
      str(x.get("date") or ""),
      str(x.get("provider") or ""),
      str(x.get("task_type") or ""),
    )

  rows_raw.sort(key=row_key)

  rows: list[dict] = []
  for x in rows_raw:
    rows.append(
      {
        "date": str(x.get("date") or ""),
        "task_type": str(x.get("task_type") or ""),
        "provider": str(x.get("provider") or ""),
        "model": str(x.get("model") or ""),
        "tier": str(x.get("tier") or ""),
        "calls": int(x.get("calls") or 0),
        "input_tokens": int(x.get("input_tokens") or 0),
        "output_tokens": int(x.get("output_tokens") or 0),
        "escalations": int(x.get("escalations") or 0),
        "validation_failures": int(x.get("validation_failures") or 0),
        "estimated_cost_usd": float(x.get("estimated_cost_usd") or 0),
      }
    )

  premium_cost = sum(rw["estimated_cost_usd"] for rw in rows if rw["tier"] == "premium")

  return {
    "from": start_date.isoformat(),
    "to": end_date.isoformat(),
    "days": days,
    "rows": rows,
    "totals": {
      "calls": sum(rw["calls"] for rw in rows),
      "input_tokens": sum(rw["input_tokens"] for rw in rows),
      "output_tokens": sum(rw["output_tokens"] for rw in rows),
      "estimated_cost_usd": round(sum(rw["estimated_cost_usd"] for rw in rows), 4),
      "premium_tier_estimated_cost_usd": round(premium_cost, 4),
    },
  }
