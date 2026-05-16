"""Prompt contract checks — no network."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = ROOT / "prompts"
sys.path.insert(0, str(ROOT))


def test_system_base_includes_new_logic_shallow_codes():
    base = (PROMPTS / "system_base.md").read_text()
    for code in ("LS_TAG_TOO_BROAD", "LS_NO_MECHANISM_LINK", "EVIDENCE_WEAK_LINK"):
        assert code in base, f"missing {code} in system_base.md"
    assert "is_logic_shallow: true" in base or "Only `LS_*` codes" in base
    assert '"news"' in base and '"event"' in base


def test_agent_prompts_reference_new_checks():
    reasoning = (PROMPTS / "agent_reasoning.md").read_text()
    market = (PROMPTS / "agent_market.md").read_text()
    coherence = (PROMPTS / "agent_coherence.md").read_text()
    assert "LS_NO_MECHANISM_LINK" in reasoning
    assert "LS_TAG_TOO_BROAD" in reasoning
    assert "LS_TAG_TOO_BROAD" in market
    assert "LS_NO_MECHANISM_LINK" in market
    assert "LS_TAG_TOO_BROAD" in coherence
    assert "Cross-tag scan" in coherence


def test_weak_link_fixture_loads():
    payload = json.loads((ROOT / "fixtures" / "weak_link_payload.json").read_text())
    ids = {t["id"] for t in payload["theses"]}
    assert "weak-tlt-news-only" in ids
    tlt = next(t for t in payload["theses"] if t["id"] == "weak-tlt-news-only")
    assert tlt["matching_event"]["matched_via"]["confirmHit"] == ["news"]
    assert "Eurovision" in tlt["matching_event"]["title"]


if __name__ == "__main__":
    import traceback

    fns = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except Exception:  # noqa: BLE001
            failed += 1
            print(f"FAIL  {fn.__name__}")
            traceback.print_exc()
    sys.exit(1 if failed else 0)
