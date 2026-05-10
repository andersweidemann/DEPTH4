"""Sparse user idea → full DEPTH4 thesis draft JSON (reasoning-heavy; routed via ``new_thesis_expand`` task)."""

from __future__ import annotations

import json
import re
from typing import Any

from signal_api.ai.llm_client import llm_text_routed
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
)

NEW_THESIS_EXPAND_SYSTEM = """You are DEPTH4 — a macro/thematic analyst helping a trader formalize a thesis.

TASK (NOT simple completion): Given a sparse user thesis idea (sometimes one sentence), infer the strongest coherent \
DEPTH4 draft they likely mean while staying faithful to their claim.

INTERNAL REASONING (do not output): work through catalyst; first- and second-order consequences; who benefits/loses; \
messy execution path; what breaks the thesis; observable signals that confirm vs invalidate. Then compress into the JSON \
fields only.

OUTPUT RULES:
- Return a single JSON object only (no markdown, no code fences, no commentary).
- Populate EVERY required field with concrete, thesis-specific prose or numbers — not generic filler.
- Do NOT leave bracket/template placeholders like [X], [Catalyst], [Risk], [Asset], [TODO], or any [square brackets].
- If something is uncertain, state a reasonable explicit assumption in plain words inside the relevant field — never empty.
- Follow DEPTH4 voice: forecast/description wording in thesis_statement and scenario lines — avoid imperative Buy/Sell/\
Go long/Go short on those strings. Trade mechanics belong in trigger_entry_setup / stop / target as observational framing.

REQUIRED JSON SHAPE (exact keys):
{
  "title": "string, <= 90 chars, scan-friendly",
  "asset": "primary tradeable symbol uppercase e.g. BTC GLD QQQ TLT XAUUSD META — pick the clearest expression of the idea",
  "direction": "long" or "short",
  "thesis_statement": "2–4 sentences, hero claim + mechanism + rough horizon",
  "why_now": "what changed or why the window is live",
  "whats_unpriced": "what the tape still embeds vs your read",
  "trigger_entry_setup": "observable gate / entry posture (words; no numeric spot quotes)",
  "stop": "invalidation / risk line described in words",
  "target": "how payoff shows up / take-profit posture in words",
  "horizon": "e.g. 2–8 weeks or 3–6 months",
  "probability_percent": integer 40-72 reflecting stated conviction in the idea,
  "scenario_base": {"probability": int, "confirms": "messy/choppy path evidence", "consequence": "what it means for sizing"},
  "scenario_bull": {"probability": int, "confirms": "clean win evidence", "consequence": "payoff framing"},
  "scenario_bear": {"probability": int, "confirms": "thesis broken evidence", "consequence": "stand-down framing"},
  "insider_flow": {
    "bull_instruments": ["optional tickers/symbols that would rally if thesis plays"],
    "bear_instruments": ["symbols that weaken if thesis plays"],
    "confirm_tags": ["short headline tags that would strengthen conviction"],
    "contradict_tags": ["tags/forces that would weaken or kill the thesis"]
  }
}

scenario_base/bull/bear probabilities must be integers >= 15 and sum to exactly 100.

FEW-SHOT FORMAT HINTS (do not copy wording literally):
Example A seed: user ties crypto upside to US regulatory clarity bill signing → infer custody/ETF/on-ramp flows, \
implementation lags, risk-off macro as failure mode, bill progress & flows as signals.
Example B seed: NATO/defense spending forced higher → infer primes vs subs, EU procurement lag, budget politics, \
ceasefire/détente as break paths."""

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


REPAIR_SYSTEM = """You repair incomplete DEPTH4 thesis-draft JSON.
Return JSON only (no fences). Fill EVERY required field with thesis-specific content.
Remove ALL bracket placeholders like [Risk]. Replace generic filler with concrete mechanisms tied to the user's seed.
scenario probabilities must be integers summing to 100."""

SCENARIO_KEYS = ("scenario_base", "scenario_bull", "scenario_bear")


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

  return {
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

  min_story = 28
  for key in (
    "title",
    "thesis_statement",
    "why_now",
    "whats_unpriced",
    "trigger_entry_setup",
    "stop",
    "target",
  ):
    v = _as_str(d.get(key))
    if len(v) < min_story:
      errs.append(f"short:{key}")
    if _has_brackets(v):
      errs.append(f"brackets:{key}")
    hit = _banned_hit(v)
    if hit:
      errs.append(f"banned:{key}:{hit}")

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

  for sk in SCENARIO_KEYS:
    block = d.get(sk)
    if not isinstance(block, dict):
      errs.append(f"scenario_shape:{sk}")
      continue
    prob = _as_int(block.get("probability"), 0)
    if prob < 15:
      errs.append(f"scenario_prob_low:{sk}")
    cf = _as_str(block.get("confirms"))
    cq = _as_str(block.get("consequence"))
    if len(cf) < min_story:
      errs.append(f"short:{sk}_confirms")
    if len(cq) < min_story:
      errs.append(f"short:{sk}_consequence")
    if _has_brackets(cf) or _has_brackets(cq):
      errs.append(f"brackets:{sk}")
    hit = _banned_hit(cf) or _banned_hit(cq)
    if hit:
      errs.append(f"banned:{sk}:{hit}")

  pp = _as_int(d.get("probability_percent"), 0)
  if pp < 35 or pp > 85:
    errs.append("probability_percent_range")

  return (len(errs) == 0, errs)


def expand_user_idea(settings: Settings, user_idea: str) -> tuple[dict[str, Any], dict[str, Any]]:
  """Returns (draft_dict, meta) where meta includes validation notes."""
  meta: dict[str, Any] = {"passes": False, "errors": [], "repaired": False}
  primary = llm_text_routed(
    settings,
    ModelTaskType.new_thesis_expand,
    NEW_THESIS_EXPAND_SYSTEM,
    build_expand_user_prompt(user_idea),
    temperature=0.25,
    high_stakes=False,
  )
  parsed = parse_draft_json(primary)
  if parsed is None:
    draft = normalize_draft({})
    errs = ["json_parse_primary"]
    meta["errors"] = errs
  else:
    draft = normalize_draft(parsed)
    ok, errs = validate_draft(draft, user_idea)
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
    return draft, meta

  draft2 = normalize_draft(parsed2)
  meta["repaired"] = True
  ok2, errs2 = validate_draft(draft2, user_idea)
  meta["errors_after_repair"] = errs2
  if ok2:
    meta["passes"] = True
    return draft2, meta

  return draft2, meta
