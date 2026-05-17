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


def _infer_asset_family(asset: str, text: str) -> str:
  sym = asset.upper()
  if re.search(r"\b(TLT|IEF|SHY|ZB|ZN|TMV)\b", sym):
    return "rates"
  if re.search(r"\b(WTI|USOIL|CL|BRENT|XLE)\b", sym):
    return "oil"
  if re.search(r"\b(BTC|ETH|BITO|IBIT)\b", sym):
    return "crypto"
  blob = f"{asset} {text}".upper()
  if re.search(r"\b(TLT|IEF|SHY|ZB|ZN|TMV|RATES|FED|DURATION|YIELD)\b", blob):
    return "rates"
  if re.search(r"\b(WTI|USOIL|OIL|OPEC|CRUDE|BRENT|XLE|CL)\b", blob):
    return "oil"
  if re.search(r"\b(BTC|ETH|BITO|CRYPTO|BITCOIN)\b", blob):
    return "crypto"
  if re.search(r"\b(LMT|RTX|NOC|GD|ITA|DEFENSE|PENTAGON|NATO)\b", blob):
    return "defense"
  if re.search(r"\b(META|NVDA|QQQ|SPY|AAPL|MSFT|EARNINGS|TECH|DMA)\b", blob):
    return "equity"
  if re.search(r"\b(DXY|FX|EURUSD)\b", blob):
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


def build_anatomy_from_draft(d: dict[str, Any]) -> dict[str, Any]:
  """Build or merge `thesis_structured_anatomy` on a normalized draft."""
  nested = d.get("thesis_structured_anatomy")
  if isinstance(nested, dict) and nested.get("four_level"):
    return nested

  asset = _as_str(d.get("asset")).upper()
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
  market = _ensure_explicit_mispricing(
    whats if len(whats) > 24 else "the first-order headline more than the lagged transmission path"
  )

  return {
    "schema_version": 1,
    "asset_family": _infer_asset_family(asset, text),
    "primary_drivers": _norm_list([stmt[:80], why[:80]], 4),
    "secondary_drivers": _norm_list([_as_str(d.get("horizon"))], 4),
    "mechanism_keywords": mechanism_keywords,
    "noise_categories": ["entertainment", "culture", "sports", "generic_macro_headline"],
    "mispricing_type": _infer_mispricing_type(f"{whats} {stmt}"),
    "market_is_pricing": market,
    "depth4_edge": whats or stmt,
    "resolution_horizon": _as_str(d.get("horizon")) or "weeks to quarters",
    "resolution_path": _as_str(d.get("target")),
    "trade_implication": _as_str(d.get("trigger_entry_setup")),
    "four_level": {
      "level1_narrative": why or stmt,
      "level2_mechanism": stmt,
      "level3_mispricing": whats
      or "Consensus embeds a cleaner path than the messy transmission DEPTH4 expects.",
      "level4_resolution": _as_str(d.get("target")) or _as_str(d.get("horizon")),
    },
    "primary_mispriced_depth": "depth_3",
    "confirm_signal_hints": mechanism_keywords,
    "generated_at": datetime.now(timezone.utc).isoformat(),
  }


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
