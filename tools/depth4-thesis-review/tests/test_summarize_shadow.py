"""Tests for summarize_shadow.py"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from summarize_shadow import summarize_report  # noqa: E402


def test_summarize_weak_link_pair():
    ref_path = ROOT / "reports" / "shadow_reference_20260516T223343Z.json"
    payload_path = ROOT / "reports" / "shadow_payload_20260516T223343Z.json"
    if not ref_path.is_file():
        ref = {
            "thesis_count": 1,
            "with_matching_event": 1,
            "flag_counts": {"LS_NO_MECHANISM_LINK": 1},
            "theses_with_any_flag": 1,
            "thesis_hits": [{"thesis_id": "t1", "title": "TLT weak", "flags": [{"code": "LS_NO_MECHANISM_LINK"}]}],
        }
        payload = {
            "theses": [{
                "id": "t1",
                "title": "TLT weak",
                "thesis_origin": "ai_generated",
                "insider_flow": {"bearInstruments": ["TLT"], "confirmTags": ["news"]},
                "matching_event": {"category": "entertainment", "matched_via": {"confirmHit": ["news"]}},
                "last_evidence": {"source": "news_events", "reasons": ["confirm_tag"]},
            }],
        }
    else:
        ref = json.loads(ref_path.read_text())
        payload = json.loads(payload_path.read_text())

    s = summarize_report(ref, payload)
    assert s["thesis_count"] >= 1
    assert s["LS_NO_MECHANISM_LINK"] >= 1
    assert s["pct_theses_with_weak_link_flag"] > 0
    assert s["top_asset_classes"]
