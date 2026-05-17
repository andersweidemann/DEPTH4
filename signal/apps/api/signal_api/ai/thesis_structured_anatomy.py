"""Phase 3B — structured thesis anatomy (drivers, mispricing, 4-L integrity)."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

GENERIC_DRIVERS = frozenset(
  {
    "macro",
    "markets",
    "geopolitics",
    "headline risk",
    "uncertainty",
    "volatility",
    "sentiment",
    "risk-off",
    "risk on",
  }
)

MISPRICING_EXPLICIT = re.compile(
  r"\b(market is (still )?pricing|market prices|crowd (still )?embed|futures (still )?price|priced for|"
  r"mispric|under-?pric|over-?pric|consensus (still )?assumes|not pricing|unpriced)\b",
  re.I,
)

GENERIC_MISPRICING = re.compile(
  r"\b(market is wrong|could impact|remains to be seen|investors may reprice|sentiment shifts)\b",
  re.I,
)

VALID_FAMILIES = frozenset(
  {"rates", "oil", "crypto", "defense", "equity", "fx", "commodities", "other"}
)

L2_META_TEMPLATE = re.compile(
  r"\b(you named the main driver|incoming headlines will test|your draft|will test whether it still holds)\b",
  re.I,
)


def _as_str(x: Any, fallback: str = "") -> str:
  if x is None:
    return fallback
  if isinstance(x, str):
    return x.strip()
  return str(x).strip()


def _norm_list(raw: Any, max_n: int = 8) -> list[str]:
  if not isinstance(raw, list):
    return []
  out: list[str] = []
  for it in raw[: max_n * 2]:
    s = _as_str(it)
    if not s:
      continue
    if any(o.lower() == s.lower() for o in out):
      continue
    out.append(s[:120])
    if len(out) >= max_n:
      break
  return out


def _collect_trade_symbols(draft: dict[str, Any]) -> list[str]:
  out: list[str] = []
  asset = _as_str(draft.get("asset")).upper()
  if asset and asset not in ("—", "-"):
    out.append(asset)
  inf = draft.get("insider_flow") if isinstance(draft.get("insider_flow"), dict) else {}
  direction = _as_str(draft.get("direction")).lower()
  bulls = [_as_str(x).upper() for x in (inf.get("bull_instruments") or []) if _as_str(x)]
  bears = [_as_str(x).upper() for x in (inf.get("bear_instruments") or []) if _as_str(x)]
  ordered = bulls + bears if direction == "long" else bears + bulls if direction == "short" else bulls + bears
  for sym in ordered:
    if sym and sym not in out:
      out.append(sym)
  return out


def _family_from_symbol(sym: str) -> str | None:
  s = _as_str(sym).upper()
  if not s:
    return None
  if re.search(r"\b(TLT|IEF|SHY|ZB|ZN|TMV)\b", s):
    return "rates"
  if re.search(r"\b(WTI|USOIL|CL|BRENT|XLE|USO)\b", s):
    return "oil"
  if re.search(r"\b(BTC|ETH|BITO|IBIT)\b", s):
    return "crypto"
  if re.search(r"\b(LMT|RTX|NOC|GD|ITA)\b", s):
    return "defense"
  if re.search(
    r"\b(SPY|QQQ|IWM|DIA|VOO|VTI|XLK|XLF|XLY|XLP|XLU|XLB|XLI|XLC|ARKK|META|NVDA|AAPL|MSFT|GOOGL|AMZN|TSLA|COIN)\b",
    s,
  ):
    return "equity"
  if re.search(r"\b(XAU|XAUUSD|GLD|HG|COPPER|GC|SI)\b", s):
    return "commodities"
  if re.search(r"\b(DXY|UUP|EURUSD|USDJPY|GBPUSD|FXE|FXY)\b", s):
    return "fx"
  return None


def _infer_asset_family(symbols: list[str], text: str) -> str:
  """Symbol-first — macro words in narrative must not override SPY/QQQ hero tickers."""
  counts: dict[str, int] = {}
  for sym in symbols:
    fam = _family_from_symbol(sym)
    if fam:
      counts[fam] = counts.get(fam, 0) + 1
  if symbols and symbols[0]:
    hero_fam = _family_from_symbol(symbols[0])
    if hero_fam:
      return hero_fam
  if counts:
    return max(counts, key=counts.get)

  blob = f"{' '.join(symbols)} {text}".upper()
  if re.search(r"\b(SPY|QQQ|IWM|DIA|EQUITY|STOCK|S&P|NASDAQ|EPS|EARNINGS)\b", blob):
    return "equity"
  if re.search(r"\b(TLT|IEF|SHY|ZB|ZN|TMV|RATES|DURATION|YIELD)\b", blob):
    return "rates"
  if re.search(r"\b(FED|FOMC|CPI|PCE|PAYROLL)\b", blob) and not re.search(
    r"\b(SPY|QQQ|STOCK|EQUITY)\b", blob
  ):
    return "rates"
  if re.search(r"\b(WTI|USOIL|OIL|OPEC|CRUDE|BRENT|XLE|CL)\b", blob):
    return "oil"
  if re.search(r"\b(BTC|ETH|BITO|CRYPTO|BITCOIN)\b", blob):
    return "crypto"
  if re.search(r"\b(LMT|RTX|NOC|GD|ITA|DEFENSE|PENTAGON|NATO)\b", blob):
    return "defense"
  if re.search(r"\b(DXY|FX|EURUSD|EM FX)\b", blob):
    return "fx"
  if re.search(r"\b(GOLD|XAU|GLD|COPPER|HG|COMMOD)\b", blob):
    return "commodities"
  return "other"


def _ensure_explicit_mispricing(text: str) -> str:
  t = _as_str(text)
  if not t:
    return "The market is still pricing the first-order headline more than the lagged transmission path."
  if MISPRICING_EXPLICIT.search(t):
    return t
  rest = t[0].lower() + t[1:] if t else t
  return f"The market is still pricing {rest}"


def _strip_mispricing_lead(text: str) -> str:
  return re.sub(r"^the market is (still )?pricing\s+", "", _as_str(text), flags=re.I)


def _first_sentence(text: str, max_len: int = 220) -> str:
  t = _as_str(text)
  if not t:
    return ""
  m = re.match(r"^[^.!?]+[.!?]?", t)
  one = (m.group(0) if m else t).strip()
  if one and one[-1] not in ".!?" and len(one) < len(t):
    one = f"{one}."
  return one if len(one) <= max_len else f"{one[: max_len - 1]}…"


def _strings_near_duplicate(a: str, b: str) -> bool:
  na = _as_str(a).lower()
  nb = _as_str(b).lower()
  if not na or not nb:
    return False
  if na == nb:
    return True
  shorter, longer = (na, nb) if len(na) <= len(nb) else (nb, na)
  return len(shorter) >= 40 and shorter[:48] in longer


def _is_l2_meta(text: str) -> bool:
  return bool(L2_META_TEMPLATE.search(_as_str(text)))


def _build_mechanism_fallback(d: dict[str, Any]) -> str:
  path = _as_str(d.get("likely_path"))
  if len(path) > 36 and not _is_l2_meta(path):
    return path[:320]
  why = _as_str(d.get("why_now"))
  if len(why) > 40:
    lead = why[:140] + ("…" if len(why) > 140 else "")
    return (
      f"Near-term mechanism (1–7d): {lead.rstrip('.')} — "
      "expect flows, vol, and positioning to move before the slower macro repricing."
    )
  trig = _as_str(d.get("trigger_entry_setup"))
  if len(trig) > 24:
    return f"Near-term mechanism (1–7d): {_first_sentence(trig)} — watch whether tape confirms transmission."
  stmt = _as_str(d.get("thesis_statement"))
  if len(stmt) > 36 and not _is_l2_meta(stmt):
    return f"Near-term mechanism (1–7d): {_first_sentence(stmt)} — first-order tape reaction should lead."
  return (
    "Near-term mechanism (1–7d): catalyst confirmation should show up in flows and vol "
    "before the full macro story reprices."
  )


def _enforce_mispricing_triad(market: str, edge: str, l3: str, whats: str) -> tuple[str, str, str]:
  m = _first_sentence(market)
  e = _first_sentence(edge)
  l3out = _as_str(l3)
  if _strings_near_duplicate(m, e):
    e = _first_sentence(
      f"DEPTH4 wedge: {_strip_mispricing_lead(whats)}"
      if len(whats) > 28
      else "The edge is second-order transmission and duration — not the headline itself."
    )
    if _strings_near_duplicate(m, e):
      e = "The edge is in how long the shock persists in positioning — not whether the headline happened."
  if _strings_near_duplicate(l3out, m) or _strings_near_duplicate(l3out, e):
    structural = (
      _as_str(whats)
      if len(whats) > 32 and not _strings_near_duplicate(whats, m)
      else "Second-order effects on positioning, duration, and cross-asset beta matter more than the first-day move."
    )
    l3out = structural if _strings_near_duplicate(l3out, structural) else f"{_first_sentence(l3out)} {structural}"
    l3out = l3out[:520]
  return m, e, l3out


def _build_mispricing_pair(whats: str, stmt: str) -> tuple[str, str]:
  wedge = whats if len(whats) > 24 else stmt
  market = _first_sentence(
    _ensure_explicit_mispricing(
      whats if len(whats) > 24 else "the first-order headline more than the lagged transmission path"
    )
  )
  edge = _first_sentence(_strip_mispricing_lead(wedge) or stmt)
  if _strings_near_duplicate(edge, market):
    edge = (
      "The edge is timing and transmission — consensus is treating the catalyst as one-day noise "
      "while the path has more duration."
    )
  return market, _first_sentence(edge)


def _build_distinct_four_level(d: dict[str, Any]) -> dict[str, str]:
  why = _as_str(d.get("why_now"))
  stmt = _as_str(d.get("thesis_statement"))
  whats = _as_str(d.get("whats_unpriced"))
  l1 = why or stmt
  hidden = _as_str(d.get("hidden_driver"))
  likely = _as_str(d.get("likely_path"))
  l2 = hidden if hidden and not _is_l2_meta(hidden) else likely if likely and not _is_l2_meta(likely) else ""
  if not l2 or _is_l2_meta(l2):
    l2 = _build_mechanism_fallback(d)
  if l2 and l1 and l2[:48] == l1[:48]:
    l2 = _build_mechanism_fallback(d)
  l3 = whats if len(whats) > 20 else _ensure_explicit_mispricing(
    "a cleaner path than the messy transmission DEPTH4 expects."
  )
  l4 = _as_str(d.get("target")) or _as_str(d.get("horizon"))
  if l4 and l3 and l4[:40] == l3[:40]:
    l4 = _as_str(d.get("trigger_entry_setup")) or l4
  return {
    "level1_narrative": l1,
    "level2_mechanism": l2,
    "level3_mispricing": l3,
    "level4_resolution": l4,
  }


def _infer_mispricing_type(text: str) -> str:
  t = text.lower()
  if re.search(r"\b(timing|calendar|when|weeks|months|quarter|delay)\b", t):
    return "timing"
  if re.search(r"\b(path|sequence|messy|choppy|resolution)\b", t):
    return "path"
  if re.search(r"\b(magnitude|scale|volatility|move)\b", t):
    return "magnitude"
  if re.search(r"\b(attention|headline|priced in|crowd)\b", t):
    return "attention"
  if re.search(r"\b(rulemaking|lag|implementation)\b", t):
    return "policy_lag"
  if re.search(r"\b(flow|etf|positioning)\b", t):
    return "flows"
  return "other"


def reconcile_anatomy(anatomy: dict[str, Any], draft: dict[str, Any]) -> dict[str, Any]:
  """Tighten LLM/heuristic anatomy without schema changes."""
  symbols = _collect_trade_symbols(draft)
  text = " ".join(
    _as_str(draft.get(k))
    for k in (
      "thesis_statement",
      "why_now",
      "whats_unpriced",
      "trigger_entry_setup",
      "target",
    )
  )
  whats = _as_str(draft.get("whats_unpriced"))
  stmt = _as_str(draft.get("thesis_statement"))
  market, edge = _build_mispricing_pair(whats, stmt)
  refined_four = _build_distinct_four_level(draft)
  fl = anatomy.get("four_level") if isinstance(anatomy.get("four_level"), dict) else {}

  def pick_level(key: str, refined: str, min_len: int) -> str:
    inc = _as_str(fl.get(key))
    if len(inc) < min_len:
      return refined
    if inc.lower() == refined.lower():
      return refined
    if len(refined) >= 40 and refined.lower() in inc.lower():
      return refined
    return inc

  def pick_l2(incoming: str, refined: str) -> str:
    if _is_l2_meta(incoming):
      return refined
    inc = _as_str(incoming)
    if len(inc) < 28:
      return refined
    if inc.lower() == refined.lower():
      return refined
    if len(refined) >= 40 and refined.lower() in inc.lower():
      return refined
    return inc

  l3_picked = pick_level("level3_mispricing", refined_four["level3_mispricing"], 40)
  existing_edge = _strip_mispricing_lead(_as_str(anatomy.get("depth4_edge")))
  edge_use = (
    _first_sentence(existing_edge)
    if len(existing_edge) > 24 and not _strings_near_duplicate(existing_edge, market)
    else edge
  )
  m_out, e_out, l3_out = _enforce_mispricing_triad(market, edge_use, l3_picked, whats)

  anatomy["asset_family"] = _infer_asset_family(symbols, text)
  anatomy["market_is_pricing"] = m_out
  anatomy["depth4_edge"] = e_out
  anatomy["four_level"] = {
    "level1_narrative": pick_level("level1_narrative", refined_four["level1_narrative"], 28),
    "level2_mechanism": pick_l2(_as_str(fl.get("level2_mechanism")), refined_four["level2_mechanism"]),
    "level3_mispricing": l3_out,
    "level4_resolution": pick_level("level4_resolution", refined_four["level4_resolution"], 40),
  }
  trigger = _as_str(draft.get("trigger_entry_setup"))
  if trigger:
    anatomy["trade_implication"] = trigger
  anatomy["mispricing_type"] = _infer_mispricing_type(f"{anatomy.get('depth4_edge')} {whats}")
  return anatomy


def build_anatomy_from_draft(d: dict[str, Any]) -> dict[str, Any]:
  """Build or merge `thesis_structured_anatomy` on a normalized draft."""
  nested = d.get("thesis_structured_anatomy")
  if isinstance(nested, dict) and nested.get("four_level"):
    return reconcile_anatomy(dict(nested), d)

  asset = _as_str(d.get("asset")).upper()
  symbols = _collect_trade_symbols(d)
  text = " ".join(
    _as_str(d.get(k))
    for k in (
      "thesis_statement",
      "why_now",
      "whats_unpriced",
      "trigger_entry_setup",
      "target",
    )
  )
  inf = d.get("insider_flow") if isinstance(d.get("insider_flow"), dict) else {}
  mechanism_keywords = _norm_list(
    (inf.get("confirm_tags") if isinstance(inf.get("confirm_tags"), list) else [])
    + (inf.get("contradict_tags") if isinstance(inf.get("contradict_tags"), list) else []),
    16,
  )
  whats = _as_str(d.get("whats_unpriced"))
  why = _as_str(d.get("why_now"))
  stmt = _as_str(d.get("thesis_statement"))
  market, edge = _build_mispricing_pair(whats, stmt)

  anatomy = {
    "schema_version": 1,
    "asset_family": _infer_asset_family(symbols, text),
    "primary_drivers": _norm_list([stmt[:80], why[:80]], 4),
    "secondary_drivers": _norm_list([_as_str(d.get("horizon"))], 4),
    "mechanism_keywords": mechanism_keywords,
    "noise_categories": ["entertainment", "culture", "sports", "generic_macro_headline"],
    "mispricing_type": _infer_mispricing_type(f"{whats} {stmt}"),
    "market_is_pricing": market,
    "depth4_edge": edge,
    "resolution_horizon": _as_str(d.get("horizon")) or "weeks to quarters",
    "resolution_path": _as_str(d.get("target")),
    "trade_implication": _as_str(d.get("trigger_entry_setup")),
    "four_level": _build_distinct_four_level(d),
    "primary_mispriced_depth": "depth_3",
    "confirm_signal_hints": mechanism_keywords,
    "generated_at": datetime.now(timezone.utc).isoformat(),
  }
  return reconcile_anatomy(anatomy, d)


def _levels_too_similar(four: dict[str, Any]) -> bool:
  norms = [
    _as_str(four.get("level1_narrative")).lower(),
    _as_str(four.get("level2_mechanism")).lower(),
    _as_str(four.get("level3_mispricing")).lower(),
    _as_str(four.get("level4_resolution")).lower(),
  ]
  norms = [n for n in norms if len(n) >= 36]
  for i in range(len(norms)):
    for j in range(i + 1, len(norms)):
      if norms[i] == norms[j]:
        return True
      if len(norms[i]) >= 48 and norms[j][:48] in norms[i]:
        return True
  return False


def validate_anatomy(anatomy: dict[str, Any], *, hero: str = "", title: str = "") -> tuple[bool, list[str]]:
  errs: list[str] = []
  hero_n = _as_str(hero or title).lower()

  primary = _norm_list(anatomy.get("primary_drivers"))
  if not primary:
    errs.append("primary_drivers_empty")
  for d in primary:
    if d.lower() in GENERIC_DRIVERS:
      errs.append("primary_driver_too_generic")
      break

  misprice = " ".join(
    [
      _as_str(anatomy.get("market_is_pricing")),
      _as_str(anatomy.get("depth4_edge")),
      _as_str((anatomy.get("four_level") or {}).get("level3_mispricing")),
    ]
  )
  if len(misprice.strip()) < 48:
    errs.append("mispricing_missing")
  elif not MISPRICING_EXPLICIT.search(misprice):
    errs.append("mispricing_not_explicit")
  if GENERIC_MISPRICING.search(misprice):
    errs.append("mispricing_generic_wording")
  edge = _as_str(anatomy.get("depth4_edge")).lower()
  if hero_n and edge == hero_n:
    errs.append("mispricing_echoes_hero_only")

  fl = anatomy.get("four_level") if isinstance(anatomy.get("four_level"), dict) else {}
  if len(_as_str(fl.get("level1_narrative"))) < 28:
    errs.append("four_level_l1_thin")
  if len(_as_str(fl.get("level2_mechanism"))) < 28:
    errs.append("four_level_l2_thin")
  if len(_as_str(fl.get("level3_mispricing"))) < 40:
    errs.append("four_level_l3_thin")
  if len(_as_str(fl.get("level4_resolution"))) < 40:
    errs.append("four_level_l4_thin")
  if _levels_too_similar(fl):
    errs.append("four_level_collapsed_paraphrase")

  if not _as_str(anatomy.get("resolution_path")) and not _as_str(anatomy.get("trade_implication")):
    errs.append("resolution_path_missing")

  fam = _as_str(anatomy.get("asset_family")).lower()
  if fam and fam not in VALID_FAMILIES:
    errs.append("asset_family_invalid")

  return (len(errs) == 0, errs)
