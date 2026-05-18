"""Resolve a causal event for a generated thesis draft."""

from __future__ import annotations

import logging
from typing import Any

from signal_api.causal.validator import ValidationResult, validate_thesis_event_link

log = logging.getLogger("depth4.causal")


def _draft_as_thesis(draft: dict[str, Any]) -> dict[str, Any]:
  return {
    "title": draft.get("title") or "",
    "statement": draft.get("thesis_statement") or draft.get("title") or "",
    "asset": draft.get("asset") or "—",
    "direction": draft.get("direction") or "long",
    "slug": draft.get("slug") or "",
  }


def resolve_event_for_thesis(
  draft: dict[str, Any],
  events: list[dict[str, Any]],
  cluster_theses_by_event: dict[str, list[dict[str, Any]]],
  *,
  preferred_event_id: str | None = None,
) -> tuple[dict[str, Any] | None, ValidationResult]:
  """
  Pick an event for *draft* that passes validation, or return None.

  Order: preferred (if valid) → first valid among *events* → None.
  """
  thesis = _draft_as_thesis(draft)

  def try_event(event: dict[str, Any]) -> tuple[dict[str, Any] | None, ValidationResult]:
    eid = str(event.get("id") or "")
    cluster = cluster_theses_by_event.get(eid, [])
    result = validate_thesis_event_link(thesis, event, cluster)
    if result.valid:
      return event, result
    return None, result

  if preferred_event_id:
    for ev in events:
      if str(ev.get("id")) == preferred_event_id:
        picked, result = try_event(ev)
        if picked:
          return picked, result
        log.error("causal validation failed for preferred event: %s", result.errors)

  for ev in events:
    picked, result = try_event(ev)
    if picked:
      return picked, result

  return None, ValidationResult(
    valid=False,
    errors=["No causal event passed validation for this thesis draft"],
    warnings=[],
  )
