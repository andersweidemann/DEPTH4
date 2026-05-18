"""Expand sparse user thesis ideas into structured drafts (Next.js proxies after Supabase auth)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from signal_api.ai.llm_client import llm_configured, llm_interactive_configured
from signal_api.ai.new_thesis_expand import expand_user_idea
from signal_api.causal.validator import validate_thesis_event_link
from signal_api.config import get_settings
from signal_api.routers.ingest_cron import _require_ingest_secret

log = logging.getLogger("depth4")

router = APIRouter()


class ThesisDraftExpandBody(BaseModel):
  idea: str = Field(..., min_length=4, max_length=8_000)
  causal_event: dict | None = Field(
    default=None,
    description="Optional causal_events row shape for pre-save validation (title, description, category).",
  )
  cluster_theses: list[dict] | None = Field(
    default=None,
    description="Existing theses already linked to causal_event (slug, title, asset, direction).",
  )


@router.post("/thesis-draft-expand")
def thesis_draft_expand(
  body: ThesisDraftExpandBody,
  x_depth4_ingest_secret: str | None = Header(default=None, alias="X-Depth4-Ingest-Secret"),
) -> dict:
  _require_ingest_secret(x_depth4_ingest_secret)
  if not (llm_configured() or llm_interactive_configured()):
    raise HTTPException(status_code=503, detail="LLM not configured on API service")

  settings = get_settings()
  draft, meta = expand_user_idea(settings, body.idea)
  ok = bool(meta.get("passes")) and bool((draft.get("title") or "").strip())
  if not ok:
    log.warning("thesis_draft_expand: incomplete draft meta=%s", meta)

  causal_validation = None
  if body.causal_event and ok:
    cluster = body.cluster_theses or []
    cv = validate_thesis_event_link(draft, body.causal_event, cluster)
    causal_validation = {"valid": cv.valid, "errors": cv.errors, "warnings": cv.warnings}
    meta = {**meta, "causal_validation": causal_validation}
    if not cv.valid:
      log.error("thesis_draft_expand: causal validation failed errors=%s", cv.errors)
      ok = False

  return {"ok": ok, "draft": draft, "meta": meta, "causal_validation": causal_validation}
