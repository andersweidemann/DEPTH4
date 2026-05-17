from signal_api.ai.thesis_structured_anatomy import build_anatomy_from_draft, validate_anatomy


def test_strong_anatomy_passes():
  d = {
    "title": "TLT fades as CPI stays sticky",
    "asset": "TLT",
    "thesis_statement": "Sticky core CPI keeps the Fed higher-for-longer than futures price, pressuring duration.",
    "why_now": "CPI and FOMC sit inside six weeks while futures still embed aggressive cuts.",
    "whats_unpriced": "The market is still pricing near-term cuts while services inflation stays sticky.",
    "trigger_entry_setup": "Add on a hot CPI that fails to break prior yield highs.",
    "stop": "Soft CPI plus dovish dots reprice cuts into the front end.",
    "target": "TLT grinds lower as real yields reprice over two quarters.",
    "horizon": "6–12 weeks",
    "insider_flow": {"confirm_tags": ["cpi", "fed"], "contradict_tags": []},
  }
  anatomy = build_anatomy_from_draft(d)
  ok, errs = validate_anatomy(anatomy, hero=d["title"])
  assert ok, errs


def test_weak_anatomy_fails():
  d = {
    "title": "Macro uncertainty",
    "asset": "SPY",
    "thesis_statement": "Macro uncertainty",
    "why_now": "Macro uncertainty",
    "whats_unpriced": "Macro uncertainty",
    "trigger_entry_setup": "Buy",
    "stop": "Sell",
    "target": "Hold",
    "horizon": "weeks",
    "insider_flow": {},
  }
  anatomy = build_anatomy_from_draft(d)
  ok, errs = validate_anatomy(anatomy, hero=d["title"])
  assert not ok
  assert len(errs) >= 3
