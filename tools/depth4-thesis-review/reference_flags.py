"""
Deterministic LS_TAG_TOO_BROAD / LS_NO_MECHANISM_LINK rules (shadow mode).
Mirrors verifier prompt instructions — no LLM, no external calls.
"""
from __future__ import annotations

import re
from typing import Any

BROAD_TAG_STOP_LIST = frozenset(
    {"news", "event", "market", "world", "macro", "headline", "update", "report"}
)


def _tokenize(text: str) -> set[str]:
    return {t.lower() for t in re.findall(r"[a-z0-9]+", text.lower())}


def _driver_tokens(drivers: list[str]) -> set[str]:
    out: set[str] = set()
    for d in drivers:
        out |= _tokenize(str(d))
    return out


def _event_text(event: dict[str, Any]) -> str:
    parts = [
        str(event.get("title", "")),
        str(event.get("category", "")),
        str(event.get("region", "")),
        " ".join(str(t) for t in event.get("tickers") or []),
    ]
    raw = event.get("raw_json")
    if isinstance(raw, dict):
        parts.extend(str(v) for v in raw.values())
    elif raw:
        parts.append(str(raw))
    return " ".join(parts)


def _sole_broad_tag_match(thesis: dict[str, Any]) -> str | None:
    event = thesis.get("matching_event") or {}
    matched = event.get("matched_via") or {}
    confirm_hit = [str(t).lower() for t in matched.get("confirmHit") or []]
    contradict_hit = [str(t).lower() for t in matched.get("contradictHit") or []]
    ticker_hit = matched.get("tickerHit") or []
    if ticker_hit:
        return None
    hits = confirm_hit + contradict_hit
    if len(hits) != 1:
        return None
    tag = hits[0]
    if tag not in BROAD_TAG_STOP_LIST:
        return None
    flow = thesis.get("insider_flow") or {}
    tags = {str(t).lower() for t in (flow.get("confirmTags") or []) + (flow.get("contradictTags") or [])}
    if tag not in tags:
        return None
    return tag


def reference_flags_for_thesis(thesis: dict[str, Any]) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []
    event = thesis.get("matching_event")
    drivers = [str(d) for d in thesis.get("drivers") or []]
    if not event:
        return flags

    broad = _sole_broad_tag_match(thesis)
    if broad:
        flags.append({
            "code": "LS_TAG_TOO_BROAD",
            "severity": "medium",
            "is_logic_shallow": True,
            "location": f"insider_flow + matching_event.matched_via ({broad})",
            "explanation": (
                f'Stop-list tag "{broad}" was the sole confirm/contradict match for an unrelated event.'
            ),
            "suggested_fix": "Replace generic tags with mechanism-specific keywords tied to drivers.",
        })

    driver_tokens = _driver_tokens(drivers)
    event_tokens = _tokenize(_event_text(event))
    glue = {
        "the", "and", "for", "with", "from", "into", "over", "than", "cycle", "risk",
        "in", "on", "at", "to", "of", "vs", "s", "a", "an", "is", "are", "was", "were",
    }
    overlap = {
        t
        for t in (driver_tokens - glue) & (event_tokens - glue)
        if len(t) >= 4
    }
    matched = event.get("matched_via") or {}
    ticker_only = bool(matched.get("tickerHit")) and not matched.get("confirmHit") and not matched.get("contradictHit")

    if drivers and not overlap:
        flags.append({
            "code": "LS_NO_MECHANISM_LINK",
            "severity": "high",
            "is_logic_shallow": True,
            "location": "matching_event vs drivers[]",
            "explanation": "Event text/metadata has no semantic cue mapping to any stated driver.",
            "suggested_fix": "Tighten tags or require category/ticker/metadata that reflects the transmission mechanism.",
        })
    elif ticker_only and drivers and len(overlap) < 2:
        flags.append({
            "code": "LS_NO_MECHANISM_LINK",
            "severity": "high",
            "is_logic_shallow": True,
            "location": "matching_event.tickerHit",
            "explanation": "Only a ticker hit links the event; drivers do not explain the transmission.",
            "suggested_fix": "Document how the ticker move relates to the chokepoint or policy driver.",
        })

    return flags
