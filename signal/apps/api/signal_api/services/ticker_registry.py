from __future__ import annotations

from typing import Any

from signal_api.db import supabase_admin


def _up(sym: str) -> str:
  return (sym or "").strip().split(".", 1)[0].upper()


def get_registry_entries(symbols: list[str]) -> dict[str, dict[str, Any]]:
  syms = sorted({_up(s) for s in (symbols or []) if _up(s)})
  if not syms:
    return {}
  sb = supabase_admin()
  r = (
    sb.table("ticker_registry")
    .select("symbol,short_name,display_name,asset_class,sector,region,themes,keywords,correlated,notes")
    .in_("symbol", syms[:500])
    .execute()
  )
  out: dict[str, dict[str, Any]] = {}
  for row in (r.data or []):
    sym = _up(str(row.get("symbol") or ""))
    if sym:
      out[sym] = row
  return out


def match_event_to_symbols(
  *,
  text: str,
  symbols: list[str],
  registry: dict[str, dict[str, Any]] | None = None,
) -> set[str]:
  """Return symbols whose registry keywords match event text."""
  if not text:
    return set()
  reg = registry or get_registry_entries(symbols)
  t = text.lower()
  hit: set[str] = set()
  for sym in symbols:
    s = _up(sym)
    row = reg.get(s)
    if not row:
      continue
    kws = row.get("keywords") or []
    for kw in kws:
      k = str(kw or "").strip().lower()
      if k and k in t:
        hit.add(s)
        break
  return hit

