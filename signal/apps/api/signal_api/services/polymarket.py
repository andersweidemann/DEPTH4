"""Optional crowd / implied-probability hints from Polymarket (public Gamma API, no key)."""
from __future__ import annotations

import json
from typing import Any
import httpx

GAMMA = "https://gamma-api.polymarket.com"


def _parse_outcome_prices(raw: str | None) -> tuple[float | None, float | None]:
  if not raw or not str(raw).strip():
    return None, None
  try:
    arr = json.loads(raw)
    if isinstance(arr, list) and len(arr) >= 2:
      a, b = arr[0], arr[1]
      return (float(a), float(b)) if a is not None and b is not None else (None, None)
  except Exception:
    return None, None
  return None, None


async def crowd_hints_for_event(headline: str) -> str:
  """Build a short natural-language block for the LLM with Polymarket-implied yes/no (first outcome)."""
  if not (headline or "").strip():
    return ""
  q = " ".join((headline or "").split()[:8])[:200]
  params: dict[str, str | int] = {
    "q": q,
    "limit_per_type": 3,
    "events_status": "active",
    "search_tags": "false",
    "search_profiles": "false",
  }
  try:
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as c:
      r = await c.get(f"{GAMMA}/public-search", params=params, headers={"Accept": "application/json"})
      r.raise_for_status()
      data = r.json()
  except Exception:
    return ""

  evs: list[dict] = (data or {}).get("events") or []
  if not evs:
    return "Polymarket: no close keyword match for a prediction market; ignore crowd layer."

  lines: list[str] = ["Polymarket (crowd, not financial advice; for calibration only):"]
  for e in evs[:4]:
    title = (e.get("title") or e.get("slug") or "")[:200]
    markets: list[dict] = (e or {}).get("markets") or []
    if not markets:
      lines.append(f"- Event: {title!r} (no market rows).")
      continue
    m0: dict[str, Any] = markets[0]
    question = (m0.get("question") or "")[:220]
    y, n = _parse_outcome_prices(m0.get("outcomePrices") if isinstance(m0, dict) else None)  # type: ignore[arg-type]
    if y is not None and n is not None:
      y_pct = int(round(100 * y))
      n_pct = int(round(100 * n))
      lines.append(
        f"- {title} — {question!r} → first outcome (often Yes) ~{y_pct}%, other leg ~{n_pct}%."
      )
    else:
      lines.append(f"- {title} — {question!r} (odds n/a in feed).")
  return "\n".join(lines)[:3_200]
