"""Single-shot internal ops dashboard: guard status + LLM spend aggregates."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Header, HTTPException, Query, status

from signal_api.ai.depth4_guard import depth4_can_run_background_llm, get_depth4_guard_status
from signal_api.config import get_settings
from signal_api.db import supabase_admin
from signal_api.routers.ingest_cron import _require_ingest_secret

router = APIRouter()

_LABELS = {
  "estimated_cost": "Estimated cost — not actual billed cost.",
  "active_users": (
    "Active users = distinct users with recent portfolio or open-order activity (last 24h, UTC)."
  ),
  "background_llm_allowed": (
    "Background LLM allowed = DEPTH4_ENABLED=true AND active_users >= MIN_ACTIVE_USERS_FOR_DEPTH4 "
    "(see min_active_users_for_depth4 in depth4_status)."
  ),
}


def _fetch_usage_rows(sb, start: date, end: date) -> list[dict]:
  r = (
    sb.table("llm_usage_stats")
    .select(
      "date,provider,model,task_type,tier,calls,input_tokens,output_tokens,"
      "escalations,validation_failures,estimated_cost_usd"
    )
    .gte("date", start.isoformat())
    .lte("date", end.isoformat())
    .execute()
  )
  return list(r.data or [])


@router.get("/llm-ops-dashboard")
def get_llm_ops_dashboard(
  days: int = Query(7, ge=1, le=30),
  x_depth4_ingest_secret: str | None = Header(default=None, alias="X-Depth4-Ingest-Secret"),
) -> dict:
  """Guard + estimated spend by provider + recent expensive aggregate rows."""
  _require_ingest_secret(x_depth4_ingest_secret)

  st = get_depth4_guard_status()
  s = get_settings()
  bg_ok = depth4_can_run_background_llm()
  depth4_status = {
    "enabled": st.enabled,
    "active_users": st.active_users,
    "meets_minimum": st.meets_minimum,
    "min_active_users_for_depth4": s.min_active_users_for_depth4,
    "background_llm_allowed": bg_ok,
    "background_llm_blocked": not bg_ok,
  }

  end_d = date.today()
  start_d = end_d - timedelta(days=days - 1)

  try:
    sb = supabase_admin()
    raw = _fetch_usage_rows(sb, start_d, end_d)
  except Exception as e:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail=f"Failed to load llm_usage_stats: {e!s}",
    ) from e

  by_provider: dict[str, dict[str, float | int]] = {}
  prov_order = ("nvidia", "kimi", "anthropic", "other")

  for x in raw:
    p = str(x.get("provider") or "other").lower() or "other"
    if p not in by_provider:
      by_provider[p] = {
        "provider": p,
        "calls": 0,
        "estimated_cost_usd": 0.0,
        "input_tokens": 0,
        "output_tokens": 0,
      }
    b = by_provider[p]
    b["calls"] = int(b["calls"]) + int(x.get("calls") or 0)
    b["estimated_cost_usd"] = float(b["estimated_cost_usd"]) + float(x.get("estimated_cost_usd") or 0)
    b["input_tokens"] = int(b["input_tokens"]) + int(x.get("input_tokens") or 0)
    b["output_tokens"] = int(b["output_tokens"]) + int(x.get("output_tokens") or 0)

  by_provider_list: list[dict] = []
  for key in prov_order:
    if key in by_provider:
      row = by_provider[key]
      by_provider_list.append(
        {
          "provider": row["provider"],
          "calls": int(row["calls"]),
          "estimated_cost_usd": round(float(row["estimated_cost_usd"]), 4),
          "input_tokens": int(row["input_tokens"]),
          "output_tokens": int(row["output_tokens"]),
        }
      )
  for p, row in sorted(by_provider.items()):
    if p in prov_order:
      continue
    by_provider_list.append(
      {
        "provider": row["provider"],
        "calls": int(row["calls"]),
        "estimated_cost_usd": round(float(row["estimated_cost_usd"]), 4),
        "input_tokens": int(row["input_tokens"]),
        "output_tokens": int(row["output_tokens"]),
      }
    )

  total_cost = sum(float(x.get("estimated_cost_usd") or 0) for x in raw)

  enriched = []
  for x in raw:
    enriched.append(
      {
        "date": str(x.get("date") or ""),
        "provider": str(x.get("provider") or ""),
        "task_type": str(x.get("task_type") or ""),
        "tier": str(x.get("tier") or ""),
        "calls": int(x.get("calls") or 0),
        "estimated_cost_usd": round(float(x.get("estimated_cost_usd") or 0), 4),
      }
    )

  enriched.sort(key=lambda r: (r["date"], r["estimated_cost_usd"]), reverse=True)
  recent_rows = enriched[:20]

  return {
    "labels": _LABELS,
    "depth4_status": depth4_status,
    "spend_summary": {
      "window_days": days,
      "from": start_d.isoformat(),
      "to": end_d.isoformat(),
      "total_estimated_cost_usd": round(total_cost, 4),
      "by_provider": by_provider_list,
    },
    "recent_rows": recent_rows,
  }
