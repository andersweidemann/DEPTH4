#!/usr/bin/env python3
"""
Phase 3A.0 — aggregate shadow_reference_*.json reports into a calibration summary.

Joins sibling shadow_payload_*.json when present for event category, tickers, and
update-path grouping. Advisory only; no runtime DEPTH4 changes.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
REPORTS_DIR = ROOT / "reports"

ASSET_CLASS_HINTS: list[tuple[str, tuple[str, ...]]] = [
    ("rates", ("TLT", "IEF", "SHY", "UST", "DXY", "EURUSD", "FED", "RATES")),
    ("equity", ("META", "QQQ", "SPY", "NVDA", "IWM", "EEM", "EQUITY")),
    ("commodities", ("WTI", "USOIL", "BRENT", "USO", "XLE", "OIL", "COPPER", "HG", "GLD", "XAU")),
    ("fx", ("DXY", "EURUSD", "FX", "EM FX")),
    ("defense", ("RTX", "LMT", "NOC", "ITA", "DEFENSE")),
    ("crypto", ("BTC", "ETH", "CRYPTO")),
]


def _stamp_from_name(path: Path) -> str:
    name = path.stem  # shadow_reference_20260516T223343Z
    if "_" in name:
        return name.split("_", 2)[-1] if name.startswith("shadow_reference_") else name
    return ""


def list_reference_reports(reports_dir: Path) -> list[Path]:
    return sorted(reports_dir.glob("shadow_reference_*.json"), key=lambda p: p.stat().st_mtime)


def load_payload_for_reference(ref_path: Path) -> dict[str, Any] | None:
    stamp = _stamp_from_name(ref_path)
    if not stamp:
        return None
    payload_path = ref_path.parent / f"shadow_payload_{stamp}.json"
    if not payload_path.is_file():
        return None
    return json.loads(payload_path.read_text())


def thesis_index(payload: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    if not payload:
        return {}
    return {str(t.get("id")): t for t in payload.get("theses") or [] if t.get("id")}


def infer_asset_class(thesis: dict[str, Any] | None, hit: dict[str, Any]) -> str:
    syms: list[str] = []
    if thesis:
        flow = thesis.get("insider_flow") or {}
        syms.extend(flow.get("bullInstruments") or [])
        syms.extend(flow.get("bearInstruments") or [])
        for s in thesis.get("signals") or []:
            if isinstance(s, dict) and s.get("ticker"):
                syms.append(str(s["ticker"]))
    title = str((thesis or {}).get("title") or hit.get("title") or "")
    blob = " ".join(syms + [title]).upper()
    for label, keys in ASSET_CLASS_HINTS:
        if any(k in blob for k in keys):
            return label
    return "other"


def extract_broad_tag(hit: dict[str, Any]) -> str | None:
    for f in hit.get("flags") or []:
        if f.get("code") != "LS_TAG_TOO_BROAD":
            continue
        loc = str(f.get("location") or "")
        m = re.search(r"matched_via \((\w+)\)", loc)
        if m:
            return m.group(1)
    return None


def extract_match_path(thesis: dict[str, Any] | None) -> str:
    if not thesis:
        return "unknown"
    le = thesis.get("last_evidence") if isinstance(thesis.get("last_evidence"), dict) else {}
    source = str(le.get("source") or "unknown")
    reasons = le.get("reasons") or []
    if isinstance(reasons, list) and reasons:
        return f"{source}:{','.join(sorted(str(r) for r in reasons))}"
    ev = thesis.get("matching_event") or {}
    mv = ev.get("matched_via") or {}
    if mv.get("tickerHit"):
        return f"{source}:ticker_hit"
    if mv.get("confirmHit"):
        return f"{source}:confirm_tag"
    if mv.get("contradictHit"):
        return f"{source}:contradict_tag"
    return source


def enrich_hit(hit: dict[str, Any], thesis: dict[str, Any] | None) -> dict[str, Any]:
    ev = (thesis or {}).get("matching_event") or {}
    flow = (thesis or {}).get("insider_flow") or {}
    tickers = list(ev.get("tickers") or [])
    for s in (thesis or {}).get("signals") or []:
        if isinstance(s, dict) and s.get("ticker"):
            tickers.append(str(s["ticker"]))
    for sym in (flow.get("bullInstruments") or []) + (flow.get("bearInstruments") or []):
        tickers.append(str(sym))
    return {
        **hit,
        "slug": hit.get("slug") or (thesis or {}).get("slug"),
        "thesis_origin": (thesis or {}).get("thesis_origin"),
        "asset_class": infer_asset_class(thesis, hit),
        "event_category": ev.get("category") or "(none)",
        "event_region": ev.get("region") or "(none)",
        "tickers": sorted({t.upper() for t in tickers if t}),
        "update_path": extract_match_path(thesis),
        "broad_tag": extract_broad_tag(hit),
    }


def summarize_report(ref: dict[str, Any], payload: dict[str, Any] | None) -> dict[str, Any]:
    idx = thesis_index(payload)
    hits = [enrich_hit(h, idx.get(str(h.get("thesis_id")))) for h in ref.get("thesis_hits") or []]

    thesis_count = int(ref.get("thesis_count") or 0)
    flag_counts = ref.get("flag_counts") or {}
    broad_n = int(flag_counts.get("LS_TAG_TOO_BROAD", 0))
    mech_n = int(flag_counts.get("LS_NO_MECHANISM_LINK", 0))
    with_flag = int(ref.get("theses_with_any_flag") or 0)
    pct = round(100.0 * with_flag / thesis_count, 1) if thesis_count else 0.0

    slug_scores: Counter[str] = Counter()
    asset_scores: Counter[str] = Counter()
    ticker_scores: Counter[str] = Counter()
    category_scores: Counter[str] = Counter()
    origin_scores: Counter[str] = Counter()
    path_scores: Counter[str] = Counter()
    broad_tag_scores: Counter[str] = Counter()

    for h in hits:
        label = str(h.get("slug") or h.get("thesis_id") or "?")
        nflags = len(h.get("flags") or [])
        if nflags:
            slug_scores[label] += nflags
        asset_scores[str(h.get("asset_class") or "other")] += nflags
        for t in h.get("tickers") or []:
            ticker_scores[str(t)] += 1
        category_scores[str(h.get("event_category") or "(none)")] += nflags
        origin_scores[str(h.get("thesis_origin") or "unknown")] += nflags
        path_scores[str(h.get("update_path") or "unknown")] += nflags
        if h.get("broad_tag"):
            broad_tag_scores[str(h["broad_tag"])] += 1

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_report": ref.get("_source_path"),
        "payload_source": (payload or {}).get("source"),
        "window_days": (payload or {}).get("window_days"),
        "thesis_count": thesis_count,
        "with_matching_event": int(ref.get("with_matching_event") or 0),
        "theses_with_any_weak_link_flag": with_flag,
        "pct_theses_with_weak_link_flag": pct,
        "LS_TAG_TOO_BROAD": broad_n,
        "LS_NO_MECHANISM_LINK": mech_n,
        "top_offending_slugs": slug_scores.most_common(15),
        "top_asset_classes": asset_scores.most_common(10),
        "top_tickers": ticker_scores.most_common(15),
        "top_event_categories": category_scores.most_common(10),
        "by_thesis_origin": origin_scores.most_common(10),
        "by_update_path": path_scores.most_common(10),
        "broad_tags_triggered": broad_tag_scores.most_common(10),
        "enriched_hits": hits,
    }


def merge_reports(refs: list[tuple[Path, dict[str, Any], dict[str, Any] | None]]) -> dict[str, Any]:
    """Use the latest report as base counts; union enrichment for pattern view."""
    if not refs:
        return {}
    latest_path, latest_ref, latest_payload = refs[-1]
    latest_ref = {**latest_ref, "_source_path": str(latest_path)}
    summary = summarize_report(latest_ref, latest_payload)
    if len(refs) > 1:
        summary["reports_merged"] = [str(p) for p, _, _ in refs]
        summary["note"] = "Counts reflect the latest shadow_reference file only."
    return summary


def print_human(s: dict[str, Any]) -> None:
    print("")
    print("=== DEPTH4 shadow weak-link diagnostics (Phase 3A.0) ===")
    print(f"source report:                {s.get('source_report', '—')}")
    if s.get("payload_source"):
        print(f"payload source:               {s['payload_source']}")
    if s.get("window_days") is not None:
        print(f"window (days):                {s['window_days']}")
    print(f"theses reviewed:              {s.get('thesis_count', 0)}")
    print(f"with matching_event:          {s.get('with_matching_event', 0)}")
    print(f"theses w/ weak-link flag:     {s.get('theses_with_any_weak_link_flag', 0)} "
          f"({s.get('pct_theses_with_weak_link_flag', 0)}%)")
    print(f"LS_TAG_TOO_BROAD (total):     {s.get('LS_TAG_TOO_BROAD', 0)}")
    print(f"LS_NO_MECHANISM_LINK (total): {s.get('LS_NO_MECHANISM_LINK', 0)}")
    print("")
    print("top offending thesis slugs:")
    for slug, n in s.get("top_offending_slugs") or []:
        print(f"  {n:3d}  {slug}")
    print("")
    print("top asset classes (by flag count):")
    for label, n in s.get("top_asset_classes") or []:
        print(f"  {n:3d}  {label}")
    print("")
    print("top tickers (theses with flags):")
    for t, n in s.get("top_tickers") or []:
        print(f"  {n:3d}  {t}")
    print("")
    print("top event categories:")
    for c, n in s.get("top_event_categories") or []:
        print(f"  {n:3d}  {c}")
    print("")
    print("by thesis origin:")
    for o, n in s.get("by_thesis_origin") or []:
        print(f"  {n:3d}  {o}")
    print("")
    print("by update path (source + match reason):")
    for p, n in s.get("by_update_path") or []:
        print(f"  {n:3d}  {p}")
    if s.get("broad_tags_triggered"):
        print("")
        print("stop-list tags that triggered LS_TAG_TOO_BROAD:")
        for t, n in s["broad_tags_triggered"]:
            print(f"  {n:3d}  {t}")
    if s.get("note"):
        print(f"\n({s['note']})")
    print("=== end diagnostics ===")
    print("")


def main() -> int:
    p = argparse.ArgumentParser(description="Summarize shadow_reference weak-link reports")
    p.add_argument("--reports-dir", type=Path, default=REPORTS_DIR)
    p.add_argument("--all", action="store_true", help="Consider all reports (counts from latest)")
    p.add_argument("--write-json", action="store_true", help="Write shadow_summary_<UTC>.json")
    p.add_argument("--report", type=Path, help="Specific shadow_reference JSON file")
    args = p.parse_args()

    reports_dir = args.reports_dir
    if not reports_dir.is_dir():
        print(f"No reports dir: {reports_dir}", file=sys.stderr)
        return 1

    if args.report:
        ref_path = args.report
        if not ref_path.is_file():
            print(f"Not found: {ref_path}", file=sys.stderr)
            return 1
        refs = [(ref_path, json.loads(ref_path.read_text()), load_payload_for_reference(ref_path))]
    else:
        paths = list_reference_reports(reports_dir)
        if not paths:
            print(f"No shadow_reference_*.json in {reports_dir}", file=sys.stderr)
            print("Run: make shadow-fixture  OR  production shadow_run first.", file=sys.stderr)
            return 1
        chosen = paths if args.all else [paths[-1]]
        refs = [(p, json.loads(p.read_text()), load_payload_for_reference(p)) for p in chosen]

    summary = merge_reports(refs)
    print_human(summary)

    if args.write_json:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        out = reports_dir / f"shadow_summary_{stamp}.json"
        # Trim enriched_hits in written JSON for size unless needed
        to_write = {**summary, "enriched_hits": summary.get("enriched_hits") or []}
        out.write_text(json.dumps(to_write, indent=2, default=str))
        print(f"Wrote {out}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
