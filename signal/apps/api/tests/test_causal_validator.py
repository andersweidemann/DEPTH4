from signal_api.causal.validator import validate_thesis_event_link


def test_rejects_war_benefit_under_deescalation():
  result = validate_thesis_event_link(
    {
      "title": "Defense spending rises",
      "thesis_statement": "War drives defense spend higher",
      "asset": "LMT",
      "direction": "long",
      "slug": "defense-long",
    },
    {
      "title": "War de-escalation in Eastern Europe",
      "description": "Peace talks ease tensions and cool the conflict",
    },
    [],
  )
  assert not result.valid
  assert any("Logic mismatch" in e for e in result.errors)


def test_rejects_same_asset_opposite_direction():
  existing = [
    {
      "slug": "gold-short",
      "title": "Gold fades",
      "asset": "GLD",
      "direction": "short",
    }
  ]
  result = validate_thesis_event_link(
    {
      "title": "Gold rips",
      "thesis_statement": "Safe haven bid",
      "asset": "GLD",
      "direction": "long",
      "slug": "gold-long",
    },
    {"title": "Geopolitical risk", "description": "Markets watch escalation"},
    existing,
  )
  assert not result.valid
  assert any("Contradiction" in e for e in result.errors)
