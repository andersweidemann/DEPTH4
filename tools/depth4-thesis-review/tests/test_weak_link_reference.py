"""Offline weak-link regression — reference rules, no LLM."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tests.weak_link_reference_flags import reference_flags_for_thesis  # noqa: E402


def test_tlt_eurovision_news_tag_flags():
    payload = json.loads((ROOT / "fixtures" / "weak_link_payload.json").read_text())
    tlt = next(t for t in payload["theses"] if t["id"] == "weak-tlt-news-only")
    codes = {f["code"] for f in reference_flags_for_thesis(tlt)}
    assert "LS_TAG_TOO_BROAD" in codes
    assert "LS_NO_MECHANISM_LINK" in codes


def test_equity_event_tag_flags():
    payload = json.loads((ROOT / "fixtures" / "weak_link_payload.json").read_text())
    meta = next(t for t in payload["theses"] if t["id"] == "weak-equity-event-tag")
    codes = {f["code"] for f in reference_flags_for_thesis(meta)}
    assert "LS_TAG_TOO_BROAD" in codes
    assert "LS_NO_MECHANISM_LINK" in codes


def test_ticker_only_oil_flags_mechanism():
    payload = json.loads((ROOT / "fixtures" / "weak_link_payload.json").read_text())
    oil = next(t for t in payload["theses"] if t["id"] == "weak-ticker-only-oil")
    codes = {f["code"] for f in reference_flags_for_thesis(oil)}
    assert "LS_NO_MECHANISM_LINK" in codes


if __name__ == "__main__":
    import traceback

    for fn in [test_tlt_eurovision_news_tag_flags, test_equity_event_tag_flags, test_ticker_only_oil_flags_mechanism]:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except Exception:  # noqa: BLE001
            print(f"FAIL  {fn.__name__}")
            traceback.print_exc()
            sys.exit(1)
    print("OK")
