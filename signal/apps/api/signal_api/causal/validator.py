"""Causal thesis ↔ event link validation (Python mirror of web causal-validator)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ValidationResult:
  valid: bool
  errors: list[str] = field(default_factory=list)
  warnings: list[str] = field(default_factory=list)


def _norm_asset(symbol: str) -> str:
  return re.sub(r"\s+", "", (symbol or "").strip().upper())


def same_target_asset(a: str, b: str) -> bool:
  x, y = _norm_asset(a), _norm_asset(b)
  if not x or not y or x in ("—", "-"):
    return False
  if x == y:
    return True
  strip = lambda s: re.sub(r"[^A-Z0-9]", "", s)
  sx, sy = strip(x), strip(y)
  if sx == sy:
    return True
  if len(sx) >= 3 and sy.find(sx) >= 0:
    return True
  if len(sy) >= 3 and sx.find(sy) >= 0:
    return True
  return False


def _direction_to_causal(direction: str) -> str:
  d = (direction or "").strip().lower()
  if d == "long":
    return "up"
  if d == "short":
    return "down"
  if d in ("up", "down"):
    return d
  return "down"


def validate_thesis_event_link(
  thesis: dict[str, Any],
  event: dict[str, Any],
  existing_cluster_theses: list[dict[str, Any]],
) -> ValidationResult:
  errors: list[str] = []
  warnings: list[str] = []

  title = str(thesis.get("title") or "")
  statement = str(thesis.get("statement") or thesis.get("thesis_statement") or title)
  slug = str(thesis.get("slug") or "")
  asset = str(thesis.get("targetAssetSymbol") or thesis.get("asset") or "—")
  direction = _direction_to_causal(str(thesis.get("direction") or ""))

  event_title = str(event.get("title") or "")
  event_desc = str(event.get("description") or "")
  event_text = f"{event_title} {event_desc}"
  thesis_text = f"{title} {statement}"

  for existing in existing_cluster_theses:
    ex_slug = str(existing.get("slug") or "")
    if slug and ex_slug == slug:
      continue
    ex_asset = str(existing.get("targetAssetSymbol") or existing.get("asset") or "")
    ex_dir = _direction_to_causal(str(existing.get("direction") or ""))
    if same_target_asset(ex_asset, asset) and ex_dir != direction:
      ex_title = str(existing.get("title") or ex_slug)
      errors.append(
        f'Contradiction: Existing thesis "{ex_title}" expects '
        f"{ex_asset} {ex_dir.upper()}, but this thesis expects {asset} {direction.upper()} "
        f"under the same event. These cannot coexist."
      )
      break

  event_deescalating = bool(
    re.search(r"\b(de-escalat|peace|thaw|ease|cool|settle|end)\b", event_text, re.I)
  )
  thesis_war_benefit = bool(
    re.search(
      r"\b(war drive|war fuel|conflict boost|tension lift|defense spend|defence spend|military spend)\b",
      thesis_text,
      re.I,
    )
  )
  if event_deescalating and thesis_war_benefit:
    errors.append(
      f'Logic mismatch: Event "{event_title}" describes de-escalation, but '
      f'thesis "{title}" claims war/conflict benefits. '
      f"Under de-escalation, war beneficiaries should weaken, not strengthen."
    )

  event_escalating = bool(re.search(r"\b(escalat|intensif|surge|flare|heat|worsen)\b", event_text, re.I))
  thesis_peace_benefit = bool(
    re.search(r"\b(peace dividend|de-escalat|thaw benefit|resolution)\b", thesis_text, re.I)
  )
  if event_escalating and thesis_peace_benefit:
    errors.append(
      f'Logic mismatch: Event "{event_title}" describes escalation, but '
      f'thesis "{title}" claims peace/de-escalation benefits.'
    )

  event_keywords = [w for w in event_title.lower().split() if len(w) > 4]
  thesis_lower = thesis_text.lower()
  shared = [kw for kw in event_keywords if kw in thesis_lower]
  if event_keywords and not shared:
    warnings.append(
      f'Thesis "{title}" does not semantically reference event "{event_title}". '
      f"Verify this thesis belongs under this event."
    )

  return ValidationResult(valid=len(errors) == 0, errors=errors, warnings=warnings)
