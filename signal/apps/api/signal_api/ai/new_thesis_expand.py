"""Sparse user idea → full DEPTH4 thesis draft JSON (reasoning-heavy; routed via ``new_thesis_expand`` task)."""

from __future__ import annotations

import json
import re
from typing import Any

from signal_api.ai.llm_client import llm_text_routed
from signal_api.ai.thesis_structured_anatomy import build_anatomy_from_draft, validate_anatomy
from signal_api.ai.model_routing import ModelTaskType, strip_json_fences
from signal_api.config import Settings

_BRACKET_PLACEHOLDER = re.compile(r"\[[^\]]{1,48}\]")

_BANNED_GENERIC = (
  "this could impact markets in many ways",
  "impact markets in many ways",
  "monitor developments closely",
  "remains to be seen",
  "only time will tell",
  "it is difficult to predict",
  "various factors could affect",
  "markets may react strongly",
  "investors may reprice the asset",
  "investors may reprice",
  "this could impact sentiment",
  "could impact sentiment",
  "the thesis could play out over time",
  "could play out over time",
  "may be wrong",
  "could go either way",
)

NEW_THESIS_EXPAND_SYSTEM = """You are DEPTH4 — the user’s first-pass macro analyst, not a form assistant.

MISSION: Take a sparse user thesis seed (often one sentence). Produce the strongest coherent DEPTH4 draft they likely mean — \
the full analytical pass — while staying faithful to their claim.

DEPTH4 writes the first serious analyst draft; the user edits afterward.

NON‑NEGOTIABLE BEHAVIOR:
- Infer missing structure: catalysts, consequences, messy paths, invalidation, flows, timing.
- Fill EVERY major JSON field with thesis‑specific content. Do not leave majors sparse when a reasonable inference exists.
- Do NOT simply restate the user’s sentence across thesis_statement / why_now / whats_unpriced / scenarios.
- Do NOT output generic finance filler (“markets may react”, “investors reprice”, “sentiment shifts”) — name mechanisms, \
actors, instruments, and observables.
- Do NOT use bracket placeholders ([Risk], [Catalyst], etc.).
- title: concise and specific — never paste the raw seed verbatim as the only headline.
- thesis_statement: rewrite as a sharp investment claim (mechanism + horizon), not a copy‑paste of the seed.
- why_now: what changed or why the window is live **now** — legislation, data path, policy calendar, positioning, flows.
- whats_unpriced: what the market still mis‑anchors on vs your read (levels of aggregation, timing, second‑order flows).
- trigger_entry_setup / stop / target: real trade logic — observable gates, invalidation facts, what “right enough” looks \
like — not vague “wait for confirmation”.
- scenario_base / bull / bear: distinct real‑world paths with different confirmation facts and consequence logic — not labels \
only.
- insider_flow: infer plausible instruments (comma‑logic symbols) and confirm/contradict headline tags tied to this thesis \
(regulation, enforcement, macro, sector). Prefer non‑empty tags/instruments when the thesis names an asset or theme.

INTERNAL REASONING (never output): catalyst → first‑order → second‑order → beneficiaries/losers → messy execution → what \
breaks the thesis → confirm vs invalidate observables. Compress into JSON fields only.

OUTPUT: Single JSON object only — no markdown, fences, or commentary.

SCHEMA (exact keys):
{
  "title": "string, scan‑friendly, <= 90 chars",
  "asset": "primary symbol uppercase (BTC, GLD, QQQ, TLT, XAUUSD, META, …)",
  "direction": "long" | "short",
  "thesis_statement": "2–4 sentences; sharp claim + mechanism",
  "why_now": "live catalyst / timing — not ‘someday’",
  "whats_unpriced": "specific wedge vs market pricing narrative",
  "trigger_entry_setup": "observable gate before acting (no spot quotes)",
  "stop": "facts that prove the trade expression wrong",
  "target": "what ‘right enough’ looks like in positioning/flows/price behavior",
  "horizon": "realistic window e.g. 2–8 weeks or 6–18 months",
  "probability_percent": integer 38–78 reflecting conviction (avoid lazy 50 defaults)",
  "scenario_base": {"probability": int, "confirms": "messy/choppy path facts", "consequence": "sizing / patience logic"},
  "scenario_bull": {"probability": int, "confirms": "clean‑win facts", "consequence": "payoff logic"},
  "scenario_bear": {"probability": int, "confirms": "invalidation facts", "consequence": "stand‑down logic"},
  "insider_flow": {
    "bull_instruments": ["…"],
    "bear_instruments": ["…"],
    "confirm_tags": ["short tags tied to thesis"],
    "contradict_tags": ["tags that kill/weaken thesis"]
  },
  "thesis_structured_anatomy": {
    "asset_family": "rates|oil|crypto|defense|equity|fx|commodities|other",
    "primary_drivers": ["2–4 concrete driver phrases — not 'macro' or 'sentiment'"],
    "secondary_drivers": ["optional supporting drivers"],
    "mechanism_keywords": ["tags/keywords that should move this thesis"],
    "noise_categories": ["entertainment", "culture", "…"],
    "mispricing_type": "timing|path|resolution|magnitude|attention|policy_lag|flows|other",
    "market_is_pricing": "what the crowd/futures/tape is effectively pricing — explicit",
    "depth4_edge": "what DEPTH4 sees differently — must name the wedge",
    "resolution_horizon": "e.g. 2–8 weeks",
    "resolution_path": "how the thesis resolves if right",
    "trade_implication": "tradeable expression without duplicating hero title",
    "four_level": {
      "level1_narrative": "immediate claim / first-order narrative (distinct from L2)",
      "level2_mechanism": "transmission path / mechanism (distinct from L1 and L3)",
      "level3_mispricing": "why consensus is wrong — use 'market is pricing…' / under- or over-pricing language",
      "level4_resolution": "resolution + trade consequence over time (distinct from L3)"
    }
  }
}

scenario probabilities: integers ≥15, sum exactly 100. Avoid lazy equal thirds unless the thesis truly supports it.

FEW‑SHOT THEMES (never paste unrelated examples into unrelated seeds):
- Crypto + US clarity/regulation → custody, ETFs, flows, rulemaking lag, enforcement risk, macro risk‑off as breaker.
- NATO/defense spend → primes vs subs, procurement lag, budgets, ceasefire/détente risk."""

FEW_SHOT_BLOCK = """
ILLUSTRATIVE COMPLETION (structure only — never paste this example into answers for unrelated seeds):

User seed: \"Bitcoin will skyrocket when the Clarity Act is signed\"
JSON sketch:
{
  \"title\": \"BTC rerates if US crypto clarity unlocks institutional pipes faster than priced\",
  \"asset\": \"BTC\",
  \"direction\": \"long\",
  \"thesis_statement\": \"If the Clarity Act passes with workable custody and market-structure rules, BTC can rerate as \
regulated pipes absorb persistent institutional flows that today sit bottlenecked by legal ambiguity — especially if \
spot ETF balances and transfer volumes inflect within weeks of enactment.\",
  \"why_now\": \"Legislative tail-risk is compressing while BTC still trades like partial denial on how fast compliant \
rails scale once text is real.\",
  \"whats_unpriced\": \"Markets anchor on headline signing, but underweight lagged balance-sheet onboarding, broker \
enablement, and stable intermediary capacity — the cumulative flow pulse can arrive after the bill.\",
  \"trigger_entry_setup\": \"Treat sustained strength only after final language plus visible ETF/net exchange flows \
confirming regulated pipes are moving balances — not a one-day headline pop.\",
  \"stop\": \"Stand down if enabling rules stall in rulemaking, major exchanges face existential enforcement, or BTC \
fails to hold structural demand after passage.\",
  \"target\": \"Scale toward momentum peaks tied to flows and realized volatility compression — trail once ETF/stacked \
balance-sheet evidence stacks.\",
  \"horizon\": \"6–18 months\",
  \"probability_percent\": 56,
  \"scenario_base\": {\"probability\": 38, \"confirms\": \"Law passes but flows dribble — chop while desks rebuild \
compliance stacks.\", \"consequence\": \"Smaller core, wider stops; add only on flow confirmations.\"},
  \"scenario_bull\": {\"probability\": 37, \"confirms\": \"ETF and treasury/advisor pipelines accelerate with clean \
rulebook; volumes step-change.\", \"consequence\": \"Thesis pays faster — scale per risk rules as flows compound.\"},
  \"scenario_bear\": {\"probability\": 25, \"confirms\": \"Bill watered down, delayed rulemaking, or macro liquidation \
overwhelms micro bullish catalyst.\", \"consequence\": \"Retire the squeeze read — invalidation first.\"},
  \"insider_flow\": {
    \"bull_instruments\": [\"BTC\", \"COIN\"],
    \"bear_instruments\": [],
    \"confirm_tags\": [\"final passage\", \"ETF flows\", \"custody rulemaking\", \"exchange listings\"],
    \"contradict_tags\": [\"SEC enforcement surge\", \"risk-off\", \"stablecoin crackdown\"]
  }
}

User seed: \"Defense stocks rally if NATO spending gets forced higher\"
JSON sketch highlights: primes vs suppliers, EU procurement lag vs US urgency, budget ceilings, ceasefire lowering \
urgency as invalidate, watch NATO communiques + award/booking lines + yields/fiscal headlines.
"""


def build_expand_user_prompt(user_idea: str) -> str:
  idea = (user_idea or "").strip()
  return f"""USER'S SPARSE IDEA (seed — expand faithfully, do not swap topics):
\"\"\"{idea}\"\"\"

{FEW_SHOT_BLOCK}

Now output ONLY the JSON object for the user's seed above."""


REPAIR_SYSTEM = """You repair failing DEPTH4 thesis-draft JSON after automated validation.

Return JSON only (no markdown fences). Same schema as production drafts.

STRICT FIXES:
- Replace generic finance filler with thesis-specific reasoning tied to the USER SEED. Infer concrete defaults (instruments, \
tags, timing) — do not leave thin-but-valid text.
- Remove bracket placeholders. Expand any field under minimum analytical depth.
- Ensure thesis_statement is a rewritten investment claim — not the seed copied multiple times.
- why_now must cite a live catalyst or calendar/timing; whats_unpriced must name a specific wedge vs consensus.
- trigger_entry_setup, stop, target must contain observable logic (ifs/whens/unless), not vague “monitor markets”.
- scenario_base / bull / bear must be semantically distinct world states with different confirms + consequences.
- insider_flow: populate plausible bull/bear instruments and confirm/contradict tags when the thesis implies an asset/theme.
- scenario probabilities: integers ≥15, sum 100; avoid 33/33/34 unless justified.

Replace generic finance filler with thesis-specific reasoning. Infer concrete defaults. Do not leave thin but valid text."""

SCENARIO_KEYS = ("scenario_base", "scenario_bull", "scenario_bear")

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokens(s: str) -> list[str]:
  return [m.group(0) for m in _TOKEN_RE.finditer((s or "").lower()) if len(m.group(0)) >= 4]


def _token_set(s: str) -> set[str]:
  return set(_tokens(s))


def _jaccard_sets(a: set[str], b: set[str]) -> float:
  if not a or not b:
    return 0.0
  inter = len(a & b)
  union = len(a | b)
  return inter / union if union else 0.0


def _norm_sentence(s: str) -> str:
  return re.sub(r"\s+", " ", (s or "").strip().lower())


def _seed_structure_issues(seed: str, d: dict[str, Any]) -> list[str]:
  errs: list[str] = []
  sn = _norm_sentence(seed)
  if len(sn) < 10:
    return errs
  ts = _norm_sentence(_as_str(d.get("thesis_statement")))
  if ts and sn == ts:
    errs.append("thesis_equals_seed")
  elif ts and len(sn) > 12 and len(ts) >= len(sn) * 0.82 and ts in sn:
    errs.append("thesis_embedded_in_seed")
  j_ts = _jaccard_sets(_token_set(sn), _token_set(ts))
  if ts and j_ts >= 0.76 and len(ts) <= len(sn) * 1.4:
    errs.append("thesis_too_close_to_seed")
  return errs


def _why_now_has_catalyst(why_now: str) -> bool:
  low = why_now.lower()
  return bool(
    re.search(
      r"\b(bill|law|act|policy|fed|ecb|rate|cpi|jobs|data|print|opec|sanction|tariff|election|war|ceasefire|deal|"
      r"regulation|sec|etf|flows|implementation|calendar|quarter|month|week|now|today|language|committee|vote|headline|"
      r"positioning|supply|demand|inventory|guidance|deficit|spending|nato|budget|procurement)\b",
      low,
    )
  )


def _trade_shell_weak(s: str) -> bool:
  low = (s or "").lower()
  vague_hits = sum(
    1
    for phrase in (
      "wait for headline",
      "monitor markets",
      "follow through",
      "your plan",
      "the zone",
      "stay nimble",
      "watch closely",
      "see what happens",
    )
    if phrase in low
  )
  logic_markers = sum(1 for m in (" if ", " when ", " unless ", " after ", " until ") if m in f" {low} ")
  return len(low) < 38 or (vague_hits >= 1 and logic_markers == 0)


def _lazy_equal_triplet(pb: int, pu: int, pe: int) -> bool:
  probs = sorted([pb, pu, pe])
  return probs[0] >= 32 and probs[2] <= 35


def _scenario_texts(d: dict[str, Any]) -> list[str]:
  out: list[str] = []
  for sk in SCENARIO_KEYS:
    block = d.get(sk)
    if isinstance(block, dict):
      out.append(_as_str(block.get("confirms")) + " " + _as_str(block.get("consequence")))
    else:
      out.append("")
  return out


def _scenarios_too_similar(d: dict[str, Any]) -> bool:
  texts = _scenario_texts(d)
  pairs = ((0, 1), (0, 2), (1, 2))
  for i, j in pairs:
    if _jaccard_sets(_token_set(texts[i]), _token_set(texts[j])) >= 0.46:
      return True
  return False


def _insider_flow_total(d: dict[str, Any]) -> int:
  inf = d.get("insider_flow")
  if not isinstance(inf, dict):
    return 0
  n = 0
  for k in ("bull_instruments", "bear_instruments", "confirm_tags", "contradict_tags"):
    v = inf.get(k)
    if isinstance(v, list):
      n += len([x for x in v if _as_str(x)])
  return n


def _as_str(x: Any, fallback: str = "") -> str:
  if x is None:
    return fallback
  if isinstance(x, str):
    return x.strip()
  return str(x).strip()


def _as_int(x: Any, default: int = 0) -> int:
  if isinstance(x, bool):
    return default
  if isinstance(x, int):
    return x
  if isinstance(x, float):
    return int(round(x))
  if isinstance(x, str) and x.strip().isdigit():
    return int(x.strip())
  try:
    return int(float(str(x)))
  except Exception:
    return default


def parse_draft_json(text: str) -> dict[str, Any] | None:
  try:
    obj = json.loads(strip_json_fences(text))
  except Exception:
    return None
  return obj if isinstance(obj, dict) else None


def normalize_draft(raw: dict[str, Any]) -> dict[str, Any]:
  """Coerce missing pieces; normalize scenario probabilities to sum 100."""
  scen: dict[str, dict[str, Any]] = {}
  for k in SCENARIO_KEYS:
    block = raw.get(k)
    if not isinstance(block, dict):
      block = {}
    scen[k] = {
      "probability": max(0, min(100, _as_int(block.get("probability"), 33))),
      "confirms": _as_str(block.get("confirms")),
      "consequence": _as_str(block.get("consequence")),
    }
  pb = scen["scenario_base"]["probability"]
  pu = scen["scenario_bull"]["probability"]
  pe = scen["scenario_bear"]["probability"]
  total = pb + pu + pe
  if total <= 0:
    pb, pu, pe = 34, 41, 25
    total = 100
  pb = max(15, min(70, pb))
  pu = max(15, min(70, pu))
  pe = max(15, min(70, pe))
  total = pb + pu + pe
  scaled = [int(round(x * 100 / total)) for x in (pb, pu, pe)]
  drift = 100 - sum(scaled)
  scaled[0] += drift
  for i, k in enumerate(SCENARIO_KEYS):
    scen[k]["probability"] = max(15, min(70, scaled[i]))
  s2 = scen["scenario_base"]["probability"] + scen["scenario_bull"]["probability"] + scen["scenario_bear"]["probability"]
  if s2 != 100:
    scen["scenario_bear"]["probability"] += 100 - s2

  inf = raw.get("insider_flow")
  if not isinstance(inf, dict):
    inf = {}

  def str_list(key: str) -> list[str]:
    v = inf.get(key)
    if not isinstance(v, list):
      return []
    out: list[str] = []
    for it in v[:12]:
      s = _as_str(it)
      if s:
        out.append(s)
    return out

  direction = _as_str(raw.get("direction")).lower()
  if direction not in ("long", "short"):
    direction = "long"

  out = {
    "title": _as_str(raw.get("title"))[:200],
    "asset": _as_str(raw.get("asset")).upper()[:32],
    "direction": direction,
    "thesis_statement": _as_str(raw.get("thesis_statement")),
    "why_now": _as_str(raw.get("why_now")),
    "whats_unpriced": _as_str(raw.get("whats_unpriced")),
    "trigger_entry_setup": _as_str(raw.get("trigger_entry_setup")),
    "stop": _as_str(raw.get("stop")),
    "target": _as_str(raw.get("target")),
    "horizon": _as_str(raw.get("horizon")),
    "probability_percent": max(1, min(95, _as_int(raw.get("probability_percent"), 55))),
    "scenario_base": scen["scenario_base"],
    "scenario_bull": scen["scenario_bull"],
    "scenario_bear": scen["scenario_bear"],
    "insider_flow": {
      "bull_instruments": str_list("bull_instruments"),
      "bear_instruments": str_list("bear_instruments"),
      "confirm_tags": str_list("confirm_tags"),
      "contradict_tags": str_list("contradict_tags"),
    },
  }
  out["thesis_structured_anatomy"] = build_anatomy_from_draft(out)
  return out


def _has_brackets(s: str) -> bool:
  return bool(_BRACKET_PLACEHOLDER.search(s))


def _banned_hit(s: str) -> str | None:
  low = s.lower()
  for b in _BANNED_GENERIC:
    if b in low:
      return b
  return None


def validate_draft(d: dict[str, Any], seed_idea: str) -> tuple[bool, list[str]]:
  errs: list[str] = []
  seed = (seed_idea or "").strip().lower()
  if len(seed) < 6:
    errs.append("seed_too_short")

  min_core = 32
  min_trade = 38

  for key in ("title", "thesis_statement", "why_now", "whats_unpriced"):
    v = _as_str(d.get(key))
    if len(v) < min_core:
      errs.append(f"short:{key}")
    if _has_brackets(v):
      errs.append(f"brackets:{key}")
    hit = _banned_hit(v)
    if hit:
      errs.append(f"banned:{key}:{hit}")

  for key in ("trigger_entry_setup", "stop", "target"):
    v = _as_str(d.get(key))
    if len(v) < min_trade:
      errs.append(f"short:{key}")
    if _has_brackets(v):
      errs.append(f"brackets:{key}")
    hit = _banned_hit(v)
    if hit:
      errs.append(f"banned:{key}:{hit}")
    if _trade_shell_weak(v):
      errs.append(f"trade_shell_weak:{key}")

  wn = _as_str(d.get("why_now"))
  if wn and not _why_now_has_catalyst(wn):
    errs.append("why_now_missing_catalyst_timing")

  wu = _as_str(d.get("whats_unpriced"))
  if wn and wu and _jaccard_sets(_token_set(wn), _token_set(wu)) >= 0.55:
    errs.append("why_now_vs_unpriced_too_similar")

  errs.extend(_seed_structure_issues(seed_idea, d))

  if len(_as_str(d.get("horizon"))) < 4:
    errs.append("short:horizon")

  ast = _as_str(d.get("asset"))
  if len(ast) < 2:
    errs.append("asset_missing")

  dir_ = _as_str(d.get("direction")).lower()
  if dir_ not in ("long", "short"):
    errs.append("direction_invalid")

  ts = _as_str(d.get("thesis_statement")).lower()
  for bad_start in ("buy ", "sell ", "go long", "go short"):
    if ts.startswith(bad_start):
      errs.append("thesis_imperative_open")

  pb = pu = pe = 0
  for sk in SCENARIO_KEYS:
    block = d.get(sk)
    if not isinstance(block, dict):
      errs.append(f"scenario_shape:{sk}")
      continue
    prob = _as_int(block.get("probability"), 0)
    if prob < 15:
      errs.append(f"scenario_prob_low:{sk}")
    if sk == "scenario_base":
      pb = prob
    elif sk == "scenario_bull":
      pu = prob
    else:
      pe = prob
    cf = _as_str(block.get("confirms"))
    cq = _as_str(block.get("consequence"))
    if len(cf) < min_core:
      errs.append(f"short:{sk}_confirms")
    if len(cq) < min_core:
      errs.append(f"short:{sk}_consequence")
    if _has_brackets(cf) or _has_brackets(cq):
      errs.append(f"brackets:{sk}")
    hit = _banned_hit(cf) or _banned_hit(cq)
    if hit:
      errs.append(f"banned:{sk}:{hit}")

  if pb and pu and pe and _lazy_equal_triplet(pb, pu, pe):
    errs.append("lazy_equal_split_probs")

  if _scenarios_too_similar(d):
    errs.append("scenarios_semantically_similar")

  pp = _as_int(d.get("probability_percent"), 0)
  if pp < 38 or pp > 82:
    errs.append("probability_percent_range")
  if pp == 50:
    errs.append("probability_lazy_fifty")

  if len(ast) >= 2 and _insider_flow_total(d) == 0:
    errs.append("insider_flow_empty_inferable")

  return (len(errs) == 0, errs)


def anatomy_warnings_for_draft(d: dict[str, Any]) -> list[str]:
  """Non-blocking anatomy QA — surfaced in expand meta; persisted on save via normalize_draft."""
  anatomy = d.get("thesis_structured_anatomy")
  if not isinstance(anatomy, dict):
    anatomy = build_anatomy_from_draft(d)
    d["thesis_structured_anatomy"] = anatomy
  ok_anat, anat_errs = validate_anatomy(anatomy, hero=_as_str(d.get("title")), title=_as_str(d.get("title")))
  return [] if ok_anat else anat_errs


def expand_user_idea(settings: Settings, user_idea: str) -> tuple[dict[str, Any], dict[str, Any]]:
  """Returns (draft_dict, meta) where meta includes validation notes."""
  meta: dict[str, Any] = {"passes": False, "errors": [], "repaired": False}
  primary = llm_text_routed(
    settings,
    ModelTaskType.new_thesis_expand,
    NEW_THESIS_EXPAND_SYSTEM,
    build_expand_user_prompt(user_idea),
    temperature=0.25,
    high_stakes=True,
  )
  parsed = parse_draft_json(primary)
  if parsed is None:
    draft = normalize_draft({})
    errs = ["json_parse_primary"]
    meta["errors"] = errs
  else:
    draft = normalize_draft(parsed)
    ok, errs = validate_draft(draft, user_idea)
    meta["anatomy_warnings"] = anatomy_warnings_for_draft(draft)
    if ok:
      meta["passes"] = True
      return draft, meta
    meta["errors"] = errs

  repair_user = f"""USER SEED:
\"\"\"{(user_idea or '').strip()}\"\"\"

VALIDATION FAILURES:
{json.dumps(errs)}

FIRST JSON ATTEMPT (fix in place; same schema):
{json.dumps(draft)}

RAW MODEL OUTPUT (may be invalid JSON — recover fields if needed):
{primary[:12000]}

Output ONLY the corrected full JSON object."""

  repaired_text = llm_text_routed(
    settings,
    ModelTaskType.new_thesis_expand,
    REPAIR_SYSTEM,
    repair_user,
    temperature=0.1,
    high_stakes=True,
  )
  parsed2 = parse_draft_json(repaired_text)
  if parsed2 is None:
    meta["repaired"] = True
    meta["repair_parse_failed"] = True
    meta["anatomy_warnings"] = anatomy_warnings_for_draft(draft)
    return draft, meta

  draft2 = normalize_draft(parsed2)
  meta["repaired"] = True
  ok2, errs2 = validate_draft(draft2, user_idea)
  meta["errors_after_repair"] = errs2
  meta["anatomy_warnings"] = anatomy_warnings_for_draft(draft2)
  if ok2:
    meta["passes"] = True
    return draft2, meta

  return draft2, meta
