#!/usr/bin/env python3
"""
Phase 3A — production mechanism-gate audit (Supabase evidence + optional shadow reference).

Reads recent NEWS_DEVELOPMENT rows, summarizes mechanism_gate / log-only / allowed,
groups by asset_family, and flags potential over-blocking vs reference_flags.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from reference_flags import reference_flags_for_thesis  # noqa: E402
from shadow_run import (  # noqa: E402
    REPORTS_DIR,
    build_payload,
    load_env_file,
    matching_event_from_evidence,
    sb_headers,
    sb_select,
)

WEB_ROOT = ROOT.parent.parent / "signal" / "apps" / "web"


def merge_env(file_env: dict[str, str]) -> dict[str, str]:
    """File first; os.environ overrides only when non-empty (fixes empty .env.local)."""
    out = {k: v for k, v in file_env.items() if v is not None}
    for k, v in os.environ.items():
        if v:
            out[k] = v
    return out


def infer_asset_from_thesis_row(row: dict[str, Any]) -> str:
    insider = row.get("insider_flow") if isinstance(row.get("insider_flow"), dict) else {}
    syms = [
        *(insider.get("bullInstruments") or insider.get("bull_instruments") or []),
        *(insider.get("bearInstruments") or insider.get("bear_instruments") or []),
    ]
    title = str(row.get("title") or "").upper()
    blob = " ".join(str(s) for s in syms) + " " + title
    if any(x in blob for x in ("TLT", "IEF", "FED", "RATES", "TREASURY")):
        return "rates"
    if any(x in blob for x in ("WTI", "USOIL", "OIL", "OPEC", "CRUDE")):
        return "oil"
    if any(x in blob for x in ("BTC", "ETH", "CRYPTO", "BITO")):
        return "crypto"
    if any(x in blob for x in ("LMT", "RTX", "NOC", "DEFENSE")):
        return "defense"
    if any(x in blob for x in ("META", "NVDA", "QQQ", "SPY", "TECH")):
        return "equity"
    return "other"


async def fetch_evidence_window(env: dict[str, str], *, days: int, limit: int) -> list[dict[str, Any]]:
    url = env.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")

    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    async with httpx.AsyncClient(timeout=60.0) as client:
        return await sb_select(
            client,
            url,
            key,
            "thesis_evidence_log",
            select="id,thesis_id,description,probability_before,probability_after,metadata,created_at,event_type,dedupe_key",
            filters={"created_at": f"gte.{since}", "event_type": "eq.NEWS_DEVELOPMENT"},
            order="created_at.desc",
            limit=limit,
        )


async def fetch_theses_by_id(env: dict[str, str], ids: list[str]) -> dict[str, dict[str, Any]]:
    if not ids:
        return {}
    url = env.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    in_filter = f"in.({','.join(ids[:80])})"
    async with httpx.AsyncClient(timeout=60.0) as client:
        rows = await sb_select(
            client,
            url,
            key,
            "theses",
            select="id,title,slug,insider_flow,body,thesis_origin",
            filters={"id": in_filter},
            limit=80,
        )
    return {str(r["id"]): r for r in rows}


def replay_gate_via_node(rows: list[dict[str, Any]], theses: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Replay TS gate on evidence rows (subprocess)."""
    payload_rows: list[dict[str, Any]] = []
    for ev in rows:
        tid = str(ev.get("thesis_id") or "")
        thesis = theses.get(tid)
        if not thesis:
            continue
        meta = ev.get("metadata") if isinstance(ev.get("metadata"), dict) else {}
        insider = thesis.get("insider_flow") if isinstance(thesis.get("insider_flow"), dict) else {}
        payload_rows.append(
            {
                "thesis": {
                    "title": thesis.get("title"),
                    "bullInstruments": insider.get("bullInstruments") or [],
                    "bearInstruments": insider.get("bearInstruments") or [],
                },
                "event": {
                    "headline": ev.get("description") or "",
                    "category": meta.get("category"),
                    "region": None,
                    "bodyText": None,
                    "oneLineSummary": None,
                    "rawJson": None,
                },
                "match": {
                    "matchText": ev.get("description") or "",
                    "confirmMatched": meta.get("confirm_tags") or [],
                    "contradictMatched": meta.get("contradict_tags") or [],
                    "tickerHits": meta.get("ticker_hits") or [],
                    "signalLevel": int(meta.get("signal_level") or 4),
                },
                "evidence_id": ev.get("id"),
                "thesis_id": tid,
                "prod_gate": meta.get("mechanism_gate"),
                "prod_block": meta.get("mechanism_block_code"),
            }
        )

    if not payload_rows:
        return []

    script = WEB_ROOT / "scripts" / "replay-mechanism-gate-batch.mjs"
    if not script.is_file():
        return []

    proc = subprocess.run(
        ["npx", "--yes", "tsx", str(script)],
        input=json.dumps(payload_rows),
        capture_output=True,
        text=True,
        cwd=str(WEB_ROOT),
        timeout=120,
    )
    if proc.returncode != 0:
        print("[audit] node replay failed:", proc.stderr[:500], file=sys.stderr)
        return []
    return json.loads(proc.stdout or "[]")


def analyze_evidence(
    evidence: list[dict[str, Any]],
    theses: dict[str, dict[str, Any]],
    replay: list[dict[str, Any]],
) -> dict[str, Any]:
    gate_counts: Counter[str] = Counter()
    block_counts: Counter[str] = Counter()
    by_asset: Counter[str] = Counter()
    log_only_by_asset: Counter[str] = Counter()
    allowed_by_asset: Counter[str] = Counter()
    flat_prob = 0
    moved_prob = 0
    legacy_no_gate = 0
    over_block_candidates: list[dict[str, Any]] = []
    replay_mismatch: list[dict[str, Any]] = []

    replay_by_ev = {str(r.get("evidence_id")): r for r in replay if r.get("evidence_id")}

    for ev in evidence:
        meta = ev.get("metadata") if isinstance(ev.get("metadata"), dict) else {}
        gate = str(meta.get("mechanism_gate") or "legacy_missing")
        gate_counts[gate] += 1
        if gate == "legacy_missing":
            legacy_no_gate += 1

        block = meta.get("mechanism_block_code")
        if block:
            block_counts[str(block)] += 1

        tid = str(ev.get("thesis_id") or "")
        asset = str(meta.get("asset_family") or infer_asset_from_thesis_row(theses.get(tid) or {}))
        by_asset[asset] += 1
        if gate == "log_only":
            log_only_by_asset[asset] += 1
        elif gate == "allowed":
            allowed_by_asset[asset] += 1

        before = ev.get("probability_before")
        after = ev.get("probability_after")
        if before and after and json.dumps(before, sort_keys=True) == json.dumps(after, sort_keys=True):
            flat_prob += 1
        elif before and after:
            moved_prob += 1

        thesis_row = theses.get(tid)
        if thesis_row and meta.get("event_id"):
            thesis_payload = {
                "id": tid,
                "title": thesis_row.get("title"),
                "drivers": [str(thesis_row.get("title") or "")],
                "insider_flow": thesis_row.get("insider_flow"),
                "matching_event": matching_event_from_evidence(ev, None),
            }
            ref_flags = reference_flags_for_thesis(thesis_payload)
            ref_mech = any(f.get("code") == "LS_NO_MECHANISM_LINK" for f in ref_flags)
            ref_broad = any(f.get("code") == "LS_TAG_TOO_BROAD" for f in ref_flags)

            if gate == "log_only" and not ref_mech and not ref_broad:
                over_block_candidates.append(
                    {
                        "thesis_id": tid,
                        "slug": thesis_row.get("slug"),
                        "headline": (ev.get("description") or "")[:120],
                        "asset_family": asset,
                        "block_code": block,
                        "reasons": meta.get("reasons"),
                        "note": "shadow reference would NOT flag; gate blocked (review)",
                    }
                )

        rep = replay_by_ev.get(str(ev.get("id")))
        if rep and gate not in ("legacy_missing", ""):
            expected = "allowed" if rep.get("allowed") else "log_only"
            if expected != gate:
                replay_mismatch.append(
                    {
                        "evidence_id": ev.get("id"),
                        "prod": gate,
                        "replay": expected,
                        "block_code": rep.get("blockCode"),
                    }
                )

    return {
        "evidence_rows": len(evidence),
        "gate_counts": dict(gate_counts),
        "block_counts": dict(block_counts),
        "by_asset": dict(by_asset),
        "log_only_by_asset": dict(log_only_by_asset),
        "allowed_by_asset": dict(allowed_by_asset),
        "flat_probability_rows": flat_prob,
        "moved_probability_rows": moved_prob,
        "legacy_no_mechanism_gate_metadata": legacy_no_gate,
        "over_block_candidates": over_block_candidates[:25],
        "replay_mismatch": replay_mismatch[:25],
    }


def print_report(audit: dict[str, Any], *, shadow_ref: dict[str, Any] | None = None) -> None:
    print("")
    print("=== DEPTH4 mechanism gate — production audit ===")
    print(f"evidence rows (window):     {audit.get('evidence_rows', 0)}")
    print(f"gate breakdown:             {audit.get('gate_counts')}")
    print(f"block codes (log-only):     {audit.get('block_counts')}")
    print(f"flat vs moved scenarios:    {audit.get('flat_probability_rows')} flat / {audit.get('moved_probability_rows')} moved")
    print(f"legacy (no gate metadata):  {audit.get('legacy_no_mechanism_gate_metadata')}")
    print("")
    print("by asset_family (total / log_only / allowed):")
    for asset, total in sorted((audit.get("by_asset") or {}).items()):
        lo = (audit.get("log_only_by_asset") or {}).get(asset, 0)
        al = (audit.get("allowed_by_asset") or {}).get(asset, 0)
        print(f"  {asset:12} total={total}  log_only={lo}  allowed={al}")
    print("")
    print(f"over-block candidates:      {len(audit.get('over_block_candidates') or [])}")
    for row in (audit.get("over_block_candidates") or [])[:8]:
        print(f"  - [{row.get('asset_family')}] {row.get('slug') or row.get('thesis_id')}: {row.get('headline')}")
        print(f"    block={row.get('block_code')} reasons={row.get('reasons')}")
    print(f"replay vs prod mismatch:    {len(audit.get('replay_mismatch') or [])}")
    if shadow_ref:
        print("")
        print("shadow reference (same window theses):")
        print(f"  LS_TAG_TOO_BROAD:         {(shadow_ref.get('flag_counts') or {}).get('LS_TAG_TOO_BROAD', 0)}")
        print(f"  LS_NO_MECHANISM_LINK:     {(shadow_ref.get('flag_counts') or {}).get('LS_NO_MECHANISM_LINK', 0)}")
    print("=== end audit ===")
    print("")


async def main_async() -> int:
    p = argparse.ArgumentParser(description="Production mechanism-gate audit")
    p.add_argument("--env-file", default="")
    p.add_argument("--days", type=int, default=14)
    p.add_argument("--evidence-limit", type=int, default=300)
    p.add_argument("--thesis-limit", type=int, default=100)
    p.add_argument("--shadow", action="store_true", help="Also run shadow reference on same thesis window")
    args = p.parse_args()

    file_env = load_env_file(Path(args.env_file)) if args.env_file else {}
    env = merge_env(file_env)

    evidence = await fetch_evidence_window(env, days=args.days, limit=args.evidence_limit)
    thesis_ids = list(dict.fromkeys(str(e.get("thesis_id")) for e in evidence if e.get("thesis_id")))
    theses = await fetch_theses_by_id(env, thesis_ids)

    replay = replay_gate_via_node(evidence, theses)
    audit = analyze_evidence(evidence, theses, replay)

    shadow_ref = None
    if args.shadow:
        from shadow_run import analyze_reference

        payload = await build_payload(env, days=args.days, limit=args.thesis_limit)
        shadow_ref = analyze_reference(payload)
        audit["shadow_reference"] = shadow_ref

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = REPORTS_DIR / f"mechanism_gate_audit_{stamp}.json"
    REPORTS_DIR.mkdir(exist_ok=True)
    out_path.write_text(json.dumps(audit, indent=2, default=str))
    print(f"[audit] report → {out_path}", file=sys.stderr)
    print_report(audit, shadow_ref=shadow_ref)
    return 0


def main() -> None:
    try:
        sys.exit(asyncio.run(main_async()))
    except RuntimeError as exc:
        print(f"[audit] {exc}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
