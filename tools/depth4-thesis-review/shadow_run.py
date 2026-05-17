#!/usr/bin/env python3
"""
Shadow-mode verifier: build a review payload from production/staging Supabase
(recent theses + NEWS_DEVELOPMENT evidence + news_events), run deterministic
LS_TAG_TOO_BROAD / LS_NO_MECHANISM_LINK reference rules, optionally fan out to
3-agent LLM review (--llm) with --fail-on never.

Usage:
  python shadow_run.py --env-file /path/to/.env.vercel.production
  python shadow_run.py --env-file /path/to/.env --days 7 --limit 60
  python shadow_run.py --env-file /path/to/.env --llm
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
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

REPORTS_DIR = ROOT / "reports"
REPORTS_DIR.mkdir(exist_ok=True)


def load_env_file(path: Path) -> dict[str, str]:
    raw = dotenv_values(path)
    return {k: v for k, v in raw.items() if k and v is not None}


def sb_headers(key: str) -> dict[str, str]:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }


async def sb_select(
    client: httpx.AsyncClient,
    base: str,
    key: str,
    table: str,
    *,
    select: str,
    filters: dict[str, str] | None = None,
    order: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    params: dict[str, str] = {"select": select, "limit": str(limit)}
    if order:
        params["order"] = order
    if filters:
        params.update(filters)
    r = await client.get(f"{base}/rest/v1/{table}", headers=sb_headers(key), params=params)
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, list) else []


def drivers_from_thesis(row: dict[str, Any]) -> list[str]:
    body = row.get("body")
    if isinstance(body, dict):
        for key in ("drivers", "causal_drivers", "key_drivers"):
            raw = body.get(key)
            if isinstance(raw, list) and raw:
                return [str(x) for x in raw[:8]]
        thesis_text = body.get("thesis") or body.get("statement") or body.get("summary")
        if isinstance(thesis_text, str) and thesis_text.strip():
            return [thesis_text.strip()[:240]]
    title = str(row.get("title") or "").strip()
    return [title] if title else ["(no drivers)"]


def matching_event_from_evidence(
    ev_row: dict[str, Any],
    news: dict[str, Any] | None,
) -> dict[str, Any]:
    meta = ev_row.get("metadata") if isinstance(ev_row.get("metadata"), dict) else {}
    confirm = [str(t).lower() for t in (meta.get("confirm_tags") or [])]
    contradict = [str(t).lower() for t in (meta.get("contradict_tags") or [])]
    ticker_hits = [str(t) for t in (meta.get("ticker_hits") or [])]
    headline = str(news.get("headline") if news else ev_row.get("description") or "")
    return {
        "title": headline,
        "category": str(news.get("category") or "") if news else "",
        "region": str(news.get("region") or "") if news else "",
        "tickers": news.get("affected_tickers") if news else ticker_hits,
        "raw_json": news.get("raw_json") if news else {"headline": headline},
        "matched_via": {
            "confirmHit": confirm,
            "contradictHit": contradict,
            "tickerHit": ticker_hits if ticker_hits else [],
        },
    }


async def build_payload(
    env: dict[str, str],
    *,
    days: int,
    limit: int,
) -> dict[str, Any]:
    url = env.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in env file")

    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    async with httpx.AsyncClient(timeout=60.0) as client:
        theses = await sb_select(
            client,
            url,
            key,
            "theses",
            select="id,title,slug,status,insider_flow,body,scenario_probabilities,updated_at,thesis_origin",
            filters={"updated_at": f"gte.{since}"},
            order="updated_at.desc",
            limit=limit,
        )

        evidence = await sb_select(
            client,
            url,
            key,
            "thesis_evidence_log",
            select="id,thesis_id,description,metadata,created_at,event_type",
            filters={
                "created_at": f"gte.{since}",
                "event_type": "eq.NEWS_DEVELOPMENT",
            },
            order="created_at.desc",
            limit=500,
        )

        news_ids: list[str] = []
        for ev in evidence:
            meta = ev.get("metadata") if isinstance(ev.get("metadata"), dict) else {}
            eid = meta.get("event_id")
            if eid:
                news_ids.append(str(eid))

        news_by_id: dict[str, dict[str, Any]] = {}
        if news_ids:
            # PostgREST in filter: id=in.(uuid1,uuid2)
            unique = list(dict.fromkeys(news_ids))[:120]
            in_filter = f"in.({','.join(unique)})"
            news_rows = await sb_select(
                client,
                url,
                key,
                "news_events",
                select="id,headline,category,region,affected_tickers,raw_json,published_at,signal_level",
                filters={"id": in_filter},
                limit=120,
            )
            for n in news_rows:
                news_by_id[str(n["id"])] = n

    latest_evidence: dict[str, dict[str, Any]] = {}
    for ev in evidence:
        tid = str(ev.get("thesis_id") or "")
        if tid and tid not in latest_evidence:
            latest_evidence[tid] = ev

    out_theses: list[dict[str, Any]] = []
    for row in theses:
        tid = str(row.get("id") or "")
        insider = row.get("insider_flow") if isinstance(row.get("insider_flow"), dict) else {}
        ev = latest_evidence.get(tid)
        matching = None
        if ev:
            meta = ev.get("metadata") if isinstance(ev.get("metadata"), dict) else {}
            news = news_by_id.get(str(meta.get("event_id") or ""))
            matching = matching_event_from_evidence(ev, news)

        prob = row.get("scenario_probabilities")
        item: dict[str, Any] = {
            "id": tid,
            "slug": row.get("slug"),
            "title": row.get("title"),
            "horizon": "3M",
            "thesis": drivers_from_thesis(row)[0] if drivers_from_thesis(row) else "",
            "drivers": drivers_from_thesis(row),
            "signals": [],
            "probability": 0.5,
            "invalidation": "(from production row)",
            "updated_at": row.get("updated_at"),
            "thesis_origin": row.get("thesis_origin"),
            "insider_flow": {
                "confirmTags": insider.get("confirmTags") or insider.get("confirm_tags") or [],
                "contradictTags": insider.get("contradictTags") or insider.get("contradict_tags") or [],
                "bullInstruments": insider.get("bullInstruments") or insider.get("bull_instruments") or [],
                "bearInstruments": insider.get("bearInstruments") or insider.get("bear_instruments") or [],
            },
            "matching_event": matching,
        }
        if isinstance(prob, dict):
            item["scenario_probabilities"] = prob
        if ev:
            em = ev.get("metadata") if isinstance(ev.get("metadata"), dict) else {}
            item["last_evidence"] = {
                "event_type": ev.get("event_type"),
                "source": em.get("source"),
                "reasons": em.get("reasons"),
                "dedupe_key": em.get("dedupe_key"),
            }
        out_theses.append(item)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "shadow_run",
        "window_days": days,
        "theses": out_theses,
    }


def analyze_reference(payload: dict[str, Any]) -> dict[str, Any]:
    flag_counts: Counter[str] = Counter()
    thesis_hits: list[dict[str, Any]] = []
    repeat: Counter[str] = Counter()

    for t in payload.get("theses") or []:
        flags = reference_flags_for_thesis(t)
        codes = [f["code"] for f in flags]
        for c in codes:
            flag_counts[c] += 1
            repeat[str(t.get("id"))] += 1
        if flags:
            thesis_hits.append({
                "thesis_id": t.get("id"),
                "slug": t.get("slug"),
                "title": t.get("title"),
                "flags": flags,
                "matching_headline": (t.get("matching_event") or {}).get("title"),
                "confirmTags": (t.get("insider_flow") or {}).get("confirmTags"),
            })

    eurovision = [
        h for h in thesis_hits
        if h.get("matching_headline") and re.search(r"eurovision", str(h["matching_headline"]), re.I)
    ]

    return {
        "thesis_count": len(payload.get("theses") or []),
        "with_matching_event": sum(1 for t in payload["theses"] if t.get("matching_event")),
        "flag_counts": dict(flag_counts),
        "theses_with_any_flag": len(thesis_hits),
        "thesis_hits": thesis_hits,
        "eurovision_caught": eurovision,
        "tlt_related": [
            h for h in thesis_hits
            if re.search(r"\bTLT\b|fed.*cut|duration|treasury", str(h.get("title") or ""), re.I)
        ],
        "repeat_offenders": repeat.most_common(15),
    }


async def maybe_llm_review(payload_path: Path, env: dict[str, str]) -> None:
    if not env.get("ANTHROPIC_API_KEY"):
        print("[shadow] skip --llm: no ANTHROPIC_API_KEY", file=sys.stderr)
        return
    if not env.get("OPENAI_API_KEY"):
        print("[shadow] skip --llm: no OPENAI_API_KEY (market agent needs OpenAI)", file=sys.stderr)
        return
    os.environ.update(env)
    import controller  # noqa: E402

    class Args:
        config = str(ROOT / "config.yaml")
        fixture = str(payload_path)
        thesis_id = None
        fail_on = "never"

    rc = await controller.main_async(Args())
    print(f"[shadow] LLM review exit={rc} (fail-on never)")


def print_editorial_summary(ref: dict[str, Any], *, report_path: Path | None = None) -> None:
    """Short log block for CI / Head of Editorial — advisory only."""
    fc = ref.get("flag_counts") or {}
    broad = int(fc.get("LS_TAG_TOO_BROAD", 0))
    mech = int(fc.get("LS_NO_MECHANISM_LINK", 0))
    print("")
    print("=== DEPTH4 thesis verifier — shadow summary (advisory) ===")
    print(f"theses reviewed:              {ref.get('thesis_count', 0)}")
    print(f"with matching_event:          {ref.get('with_matching_event', 0)}")
    print(f"theses with any flag:         {ref.get('theses_with_any_flag', 0)}")
    print(f"LS_TAG_TOO_BROAD:             {broad}")
    print(f"LS_NO_MECHANISM_LINK:         {mech}")
    print(f"eurovision-style caught:      {len(ref.get('eurovision_caught') or [])}")
    if report_path:
        print(f"report:                       {report_path}")
    print("top offenders (thesis id / slug):")
    for tid, n in (ref.get("repeat_offenders") or [])[:10]:
        hit = next((h for h in ref.get("thesis_hits") or [] if h.get("thesis_id") == tid), {})
        slug = hit.get("slug") or tid
        codes = [f["code"] for f in hit.get("flags") or []]
        print(f"  - {slug} ({tid}) flags={n} [{', '.join(codes)}]")
    print("=== end shadow summary ===")
    print("")


async def fetch_home_signals(base_url: str, token: str | None) -> dict[str, Any]:
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = token if token.lower().startswith("bearer ") else f"Bearer {token}"
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        r = await client.get(f"{base_url.rstrip('/')}/api/theses/home-signals", headers=headers)
        r.raise_for_status()
        return r.json()


async def main_async() -> int:
    p = argparse.ArgumentParser(description="DEPTH4 verifier shadow run")
    p.add_argument("--env-file", default="", help="Optional .env file; os.environ wins (use with vercel env run)")
    p.add_argument("--days", type=int, default=7)
    p.add_argument("--limit", type=int, default=80)
    p.add_argument("--llm", action="store_true", help="Also run 3-agent LLM review (needs API keys)")
    p.add_argument("--base-url", help="Optional DEPTH4_BASE_URL for home-signals probe")
    p.add_argument(
        "--fixture",
        help="Offline JSON payload (skips Supabase); e.g. fixtures/weak_link_payload.json",
    )
    p.add_argument(
        "--quiet",
        action="store_true",
        help="Print editorial summary only (no full JSON to stdout)",
    )
    args = p.parse_args()

    file_env = load_env_file(Path(args.env_file)) if args.env_file else {}

    def merge_env() -> dict[str, str]:
        out = {k: v for k, v in file_env.items() if v}
        for k, v in os.environ.items():
            if v:
                out[k] = v
        return out

    env = merge_env()

    if args.fixture:
        payload = json.loads(Path(args.fixture).read_text())
        if not payload.get("source"):
            payload["source"] = f"fixture:{args.fixture}"
    else:
        payload = await build_payload(env, days=args.days, limit=args.limit)
    ref = analyze_reference(payload)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    payload_path = REPORTS_DIR / f"shadow_payload_{stamp}.json"
    report_path = REPORTS_DIR / f"shadow_reference_{stamp}.json"
    payload_path.write_text(json.dumps(payload, indent=2, default=str))
    report_path.write_text(json.dumps(ref, indent=2, default=str))

    home_note: dict[str, Any] = {}
    if args.base_url:
        try:
            home_note = await fetch_home_signals(args.base_url, env.get("DEPTH4_AUTH_TOKEN"))
        except Exception as exc:  # noqa: BLE001
            home_note = {"error": str(exc)}

    print(f"[shadow] payload → {payload_path}", file=sys.stderr)
    print(f"[shadow] reference report → {report_path}", file=sys.stderr)
    print_editorial_summary(ref, report_path=report_path)
    if not args.quiet:
        print(json.dumps({"home_signals": home_note, **ref}, indent=2))

    if args.llm:
        await maybe_llm_review(payload_path, env)

    return 0


def main() -> None:
    sys.exit(asyncio.run(main_async()))


if __name__ == "__main__":
    main()
