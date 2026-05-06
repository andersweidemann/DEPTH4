"""
Scout agent: mines GitHub for trading EAs / indicators / strategies, applies
quality + license filters, and emits distilled idea cards under
scouting/idea_cards/.

Never writes outside scouting/.

Usage:
    python -m agents.scout --max-results 30
    python -m agents.scout --queries "MT5 XAUUSD EA" "MQL5 regime indicator"
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import requests
import yaml

from agents import config, llm_client


GITHUB_API = "https://api.github.com"

PORT_ALLOWED = {"MIT", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0",
                "Unlicense", "0BSD", "ISC"}
COPYLEFT = {"MPL-2.0", "LGPL-2.1", "LGPL-3.0", "GPL-2.0", "GPL-3.0", "AGPL-3.0"}

QUALITY_RED_FLAGS = [
    re.compile(r"\blot\s*\*=\s*\d", re.IGNORECASE),
    re.compile(r"martingale", re.IGNORECASE),
    re.compile(r"guaranteed\s+profit", re.IGNORECASE),
    re.compile(r"100%\s+win", re.IGNORECASE),
    re.compile(r"signal\s+seller", re.IGNORECASE),
    re.compile(r"grid_step", re.IGNORECASE),
]


@dataclass
class Hit:
    owner: str
    repo: str
    description: str
    readme_excerpt: str
    license_spdx: str
    stars: int
    last_commit: str
    language: str
    sample_source_excerpt: str
    url: str
    commit: str


# ---------------------------------------------------------------------------
# GitHub client
# ---------------------------------------------------------------------------

def _session() -> requests.Session:
    s = requests.Session()
    headers = {"Accept": "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    s.headers.update(headers)
    return s


def search_repos(session: requests.Session, query: str, per_page: int = 25) -> List[dict]:
    url = f"{GITHUB_API}/search/repositories"
    params = {"q": query, "sort": "stars", "order": "desc", "per_page": per_page}
    r = session.get(url, params=params, timeout=30)
    if r.status_code == 403:
        print(f"[scout] rate-limited on '{query}' - sleeping 20s", file=sys.stderr)
        time.sleep(20)
        r = session.get(url, params=params, timeout=30)
    r.raise_for_status()
    return r.json().get("items", [])


def get_readme(session: requests.Session, owner: str, repo: str) -> str:
    r = session.get(f"{GITHUB_API}/repos/{owner}/{repo}/readme", timeout=30)
    if r.status_code != 200:
        return ""
    data = r.json()
    if data.get("encoding") == "base64":
        try:
            return base64.b64decode(data["content"]).decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            return ""
    return ""


def get_sample_source(session: requests.Session, owner: str, repo: str,
                      default_branch: str) -> tuple[str, str]:
    """Return (source_excerpt, commit_sha). Picks the first .mq5/.mqh/.py/.pine found."""
    tree = session.get(f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{default_branch}",
                       params={"recursive": "1"}, timeout=30)
    if tree.status_code != 200:
        return "", ""
    items = tree.json().get("tree", [])
    priority = (".mq5", ".mqh", ".mq4", ".py", ".pine")
    chosen: Optional[dict] = None
    for it in items:
        if it.get("type") != "blob":
            continue
        for ext in priority:
            if it["path"].lower().endswith(ext) and (it.get("size", 0) or 0) < 200_000:
                chosen = it
                break
        if chosen:
            break
    if not chosen:
        return "", ""
    blob = session.get(f"{GITHUB_API}/repos/{owner}/{repo}/git/blobs/{chosen['sha']}",
                       timeout=30)
    if blob.status_code != 200:
        return "", ""
    data = blob.json()
    content = ""
    if data.get("encoding") == "base64":
        try:
            content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            content = ""
    return content[:2000], chosen["sha"]


def _last_commit_date(session: requests.Session, owner: str, repo: str) -> str:
    r = session.get(f"{GITHUB_API}/repos/{owner}/{repo}/commits",
                    params={"per_page": 1}, timeout=30)
    if r.status_code != 200:
        return ""
    items = r.json()
    if not items:
        return ""
    return items[0]["commit"]["committer"]["date"][:10]


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------

def _license_verdict(spdx: str) -> str:
    if not spdx:
        return "inspiration_only"
    if spdx in PORT_ALLOWED:
        return "port_allowed"
    if spdx in COPYLEFT:
        return "inspiration_only"
    return "inspiration_only"


def _is_low_quality(hit: Hit, denylist: List[re.Pattern]) -> bool:
    if hit.stars < 10 and _years_old(hit.last_commit) > 2:
        return True
    if len(hit.readme_excerpt) < 300:
        return True
    for pat in QUALITY_RED_FLAGS:
        if pat.search(hit.sample_source_excerpt) or pat.search(hit.readme_excerpt):
            return True
    for pat in denylist:
        if pat.search(f"{hit.owner}/{hit.repo}"):
            return True
    return False


def _years_old(iso_date: str) -> float:
    if not iso_date:
        return 99.0
    try:
        import datetime as dt
        d = dt.date.fromisoformat(iso_date)
        today = dt.date.today()
        return (today - d).days / 365.25
    except Exception:  # noqa: BLE001
        return 99.0


def _load_denylist() -> List[re.Pattern]:
    p = config.repo_root() / "scouting" / "denylist.yaml"
    if not p.exists():
        return []
    data = yaml.safe_load(p.read_text()) or {}
    patterns = data.get("patterns") or []
    repos = data.get("repos") or []
    compiled = [re.compile(re.escape(r)) for r in repos]
    compiled.extend(re.compile(p, re.IGNORECASE) for p in patterns)
    return compiled


# ---------------------------------------------------------------------------
# Card emission
# ---------------------------------------------------------------------------

def _slug(owner: str, repo: str) -> str:
    base = f"{owner}-{repo}".lower()
    return re.sub(r"[^a-z0-9-]+", "-", base).strip("-")[:80]


def _write_card(card: Dict, out_dir: Path) -> Path:
    slug = card["slug"]
    path = out_dir / f"{slug}.md"
    fm = card["frontmatter"]
    front = "---\n" + yaml.safe_dump(fm, sort_keys=False).strip() + "\n---\n\n"
    path.write_text(front + card["body_markdown"].strip() + "\n", encoding="utf-8")
    return path


# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------

def collect_hits(queries: Iterable[str], max_per_query: int) -> List[Hit]:
    s = _session()
    denylist = _load_denylist()
    hits: List[Hit] = []
    seen: set[str] = set()
    for q in queries:
        try:
            items = search_repos(s, q, per_page=max_per_query)
        except requests.HTTPError as e:
            print(f"[scout] search failed for '{q}': {e}", file=sys.stderr)
            continue
        for it in items:
            full = it["full_name"]
            if full in seen:
                continue
            seen.add(full)
            owner, repo = it["owner"]["login"], it["name"]
            readme = get_readme(s, owner, repo)
            sample, commit_sha = get_sample_source(s, owner, repo,
                                                   it.get("default_branch") or "main")
            license_info = it.get("license") or {}
            spdx = license_info.get("spdx_id") or ""
            last_commit = _last_commit_date(s, owner, repo) or (
                it.get("pushed_at") or "")[:10]
            hit = Hit(
                owner=owner, repo=repo,
                description=(it.get("description") or "")[:500],
                readme_excerpt=readme[:4000],
                license_spdx=spdx,
                stars=int(it.get("stargazers_count") or 0),
                last_commit=last_commit,
                language=it.get("language") or "",
                sample_source_excerpt=sample,
                url=it.get("html_url") or f"https://github.com/{owner}/{repo}",
                commit=commit_sha or "",
            )
            if _is_low_quality(hit, denylist):
                continue
            hits.append(hit)
    return hits


def distill_with_llm(hits: List[Hit], cfg: dict) -> List[Dict]:
    """Ask the Scout LLM to produce idea cards for the filtered hits."""
    if not hits:
        return []
    template = llm_client.load_prompt("scout")
    search_hits = [
        {
            "owner": h.owner, "repo": h.repo, "description": h.description,
            "readme_excerpt": h.readme_excerpt[:2000],
            "license_spdx": h.license_spdx, "stars": h.stars,
            "last_commit": h.last_commit, "language": h.language,
            "sample_source_excerpt": h.sample_source_excerpt,
            "url": h.url, "commit": h.commit,
        }
        for h in hits
    ]
    denylist = _load_denylist()
    rendered = llm_client.render(template, {
        "search_hits_json": json.dumps(search_hits, indent=2),
        "symbols": "XAUUSD, GER40",
        "timeframes": "M5, M15",
        "denylist": ", ".join(p.pattern for p in denylist),
    })
    resp = llm_client.complete(
        system="You are the Scout. Output a JSON array of idea-card objects only.",
        user=rendered,
    )
    from agents.run_loop import _extract_json
    try:
        cards = _extract_json(resp)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Scout LLM did not return valid JSON: {e}\n---\n{resp[:500]}")
    for c in cards:
        if "slug" not in c:
            fm = c.get("frontmatter", {})
            c["slug"] = _slug(*(fm.get("source_url", "unknown/unknown")
                                .rstrip("/").split("/")[-2:]))
    return cards


def run(queries: Optional[List[str]] = None, max_per_query: int = 25,
        use_llm: bool = True) -> List[Path]:
    cfg = config.load()
    queries = queries or cfg["scout"]["default_queries"]
    out_dir = config.repo_root() / "scouting" / "idea_cards"
    out_dir.mkdir(parents=True, exist_ok=True)

    hits = collect_hits(queries, max_per_query)
    print(f"[scout] {len(hits)} hits after quality filter")

    if not use_llm or not hits:
        written: List[Path] = []
        for h in hits:
            card = _card_from_hit(h)
            written.append(_write_card(card, out_dir))
        return written

    cards = distill_with_llm(hits, cfg)
    written = []
    for c in cards:
        if c.get("frontmatter", {}).get("license_verdict") == "skip":
            continue
        written.append(_write_card(c, out_dir))
    print(f"[scout] wrote {len(written)} idea cards to {out_dir}")
    return written


def _card_from_hit(h: Hit) -> Dict:
    """Fallback: deterministic card when LLM is disabled."""
    slug = _slug(h.owner, h.repo)
    fm = {
        "source_url": h.url,
        "commit": h.commit,
        "license": h.license_spdx or "none",
        "license_verdict": _license_verdict(h.license_spdx),
        "stars": h.stars,
        "last_commit": h.last_commit,
        "language": h.language or "other",
        "symbols_targeted": [],
        "timeframes_targeted": [],
        "scout_verdict": "interesting",
    }
    body = (
        f"# {h.owner}/{h.repo}\n\n"
        f"## Core idea\n{h.description or '(no description)'}\n\n"
        f"## Readme excerpt\n{h.readme_excerpt[:800]}\n\n"
        f"## Red flags\n(auto-card, LLM disabled - review manually)\n"
    )
    return {"slug": slug, "frontmatter": fm, "body_markdown": body}


def cli() -> int:
    p = argparse.ArgumentParser(description="Scout GitHub for EAs and indicators")
    p.add_argument("--queries", nargs="+", help="Override config.yaml queries")
    p.add_argument("--max-results", type=int, default=25,
                   help="Per-query result cap (default 25)")
    p.add_argument("--no-llm", action="store_true",
                   help="Skip LLM distillation (produces terse auto-cards)")
    p.add_argument(
        "--config",
        default=None,
        help="Optional campaign YAML merged over config.yaml (scout queries).",
    )
    args = p.parse_args()
    config.set_overlay(args.config.strip() if args.config else None)
    run(args.queries, args.max_results, use_llm=not args.no_llm)
    return 0


if __name__ == "__main__":
    sys.exit(cli())
