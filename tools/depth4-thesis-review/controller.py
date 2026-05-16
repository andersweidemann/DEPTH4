#!/usr/bin/env python3
"""
DEPTH4 — 3-Agent Parallel Thesis Review Pipeline
=================================================

Fans out the latest output of /api/theses/home-signals to three specialist
reviewers (reasoning, market, coherence), runs them concurrently, and writes
a discrepancy report plus a "logic-shallow leaderboard" identifying which
agent surfaced the most reasoning-quality issues.

Usage:
    python controller.py                       # full run, default config
    python controller.py --fixture fixtures/sample_payload.json   # offline
    python controller.py --fail-on high        # exit 1 on any high flag (CI)
    python controller.py --thesis-id depth4-001  # single thesis
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
PROMPTS_DIR = ROOT / "prompts"
REPORTS_DIR = ROOT / "reports"
REPORTS_DIR.mkdir(exist_ok=True)

AGENTS = ("reasoning", "market", "coherence")


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

@dataclass
class AgentConfig:
    name: str
    provider: str           # "anthropic" | "openai"
    model: str
    temperature: float = 0.0
    max_tokens: int = 2000
    prompt_file: str = ""


@dataclass
class PipelineConfig:
    endpoint: str
    auth_header: str
    timeout_s: int
    fail_on: str            # "low" | "medium" | "high" | "never"
    agents: dict[str, AgentConfig] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path) -> "PipelineConfig":
        raw = yaml.safe_load(path.read_text())
        agents = {
            name: AgentConfig(name=name, **spec)
            for name, spec in raw["agents"].items()
        }
        return cls(
            endpoint=raw["endpoint"],
            auth_header=raw.get("auth_header", "Authorization"),
            timeout_s=raw.get("timeout_s", 90),
            fail_on=raw.get("fail_on", "high"),
            agents=agents,
        )


# ---------------------------------------------------------------------------
# Payload fetch
# ---------------------------------------------------------------------------

async def fetch_payload(cfg: PipelineConfig, fixture: Path | None) -> dict[str, Any]:
    if fixture:
        return json.loads(fixture.read_text())

    base = os.environ.get("DEPTH4_BASE_URL", "").rstrip("/")
    if not base:
        raise RuntimeError("DEPTH4_BASE_URL is not set (and no --fixture given)")

    url = f"{base}{cfg.endpoint}"
    headers: dict[str, str] = {}
    token = os.environ.get("DEPTH4_AUTH_TOKEN")
    if token:
        headers[cfg.auth_header] = (
            token if token.lower().startswith("bearer ") else f"Bearer {token}"
        )

    async with httpx.AsyncClient(timeout=cfg.timeout_s) as client:
        r = await client.get(url, headers=headers)
        r.raise_for_status()
        return r.json()


# ---------------------------------------------------------------------------
# Agent invocation
# ---------------------------------------------------------------------------

def build_prompt(agent_cfg: AgentConfig, payload_slice: dict[str, Any]) -> tuple[str, str]:
    base = (PROMPTS_DIR / "system_base.md").read_text()
    spec = (PROMPTS_DIR / agent_cfg.prompt_file).read_text()
    system = f"{base}\n\n---\n\n{spec}"
    user = (
        "Review the following DEPTH4 thesis payload. Return STRICT JSON per the "
        "output contract.\n\nPAYLOAD:\n```json\n"
        + json.dumps(payload_slice, indent=2, default=str)
        + "\n```"
    )
    return system, user


async def call_anthropic(client: httpx.AsyncClient, agent_cfg: AgentConfig,
                         system: str, user: str) -> str:
    key = os.environ["ANTHROPIC_API_KEY"]
    r = await client.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": agent_cfg.model,
            "max_tokens": agent_cfg.max_tokens,
            "temperature": agent_cfg.temperature,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        },
    )
    r.raise_for_status()
    data = r.json()
    return "".join(b["text"] for b in data["content"] if b["type"] == "text")


async def call_openai(client: httpx.AsyncClient, agent_cfg: AgentConfig,
                      system: str, user: str) -> str:
    key = os.environ["OPENAI_API_KEY"]
    r = await client.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "authorization": f"Bearer {key}",
            "content-type": "application/json",
        },
        json={
            "model": agent_cfg.model,
            "temperature": agent_cfg.temperature,
            "max_tokens": agent_cfg.max_tokens,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        },
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)


def parse_agent_json(raw: str, agent_name: str, thesis_id: str) -> dict[str, Any]:
    """Best-effort JSON extraction. Returns an error stub on failure."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    m = _JSON_RE.search(raw)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return {
        "agent": agent_name,
        "thesis_id": thesis_id,
        "verdict": "fail",
        "confidence": 0.0,
        "logic_shallow_count": 0,
        "flags": [{
            "code": "PARSE_ERROR",
            "severity": "high",
            "is_logic_shallow": False,
            "location": "agent_output",
            "explanation": "Agent returned non-JSON output",
            "suggested_fix": "Re-run or lower temperature",
        }],
        "rationale": raw[:300],
        "_raw": raw,
    }


async def run_agent(client: httpx.AsyncClient, agent_cfg: AgentConfig,
                    thesis: dict[str, Any]) -> dict[str, Any]:
    system, user = build_prompt(agent_cfg, thesis)
    started = time.monotonic()
    try:
        if agent_cfg.provider == "anthropic":
            raw = await call_anthropic(client, agent_cfg, system, user)
        elif agent_cfg.provider == "openai":
            raw = await call_openai(client, agent_cfg, system, user)
        else:
            raise ValueError(f"Unknown provider: {agent_cfg.provider}")
    except Exception as exc:                            # noqa: BLE001
        return {
            "agent": agent_cfg.name,
            "thesis_id": thesis.get("id", "?"),
            "verdict": "fail",
            "confidence": 0.0,
            "logic_shallow_count": 0,
            "flags": [{
                "code": "AGENT_ERROR",
                "severity": "high",
                "is_logic_shallow": False,
                "location": "transport",
                "explanation": f"{type(exc).__name__}: {exc}",
                "suggested_fix": "Check API key / network / model name",
            }],
            "rationale": "",
            "_latency_ms": int((time.monotonic() - started) * 1000),
        }
    result = parse_agent_json(raw, agent_cfg.name, thesis.get("id", "?"))
    result["_latency_ms"] = int((time.monotonic() - started) * 1000)
    return result


# ---------------------------------------------------------------------------
# Discrepancy analysis
# ---------------------------------------------------------------------------

SEVERITY_RANK = {"low": 1, "medium": 2, "high": 3}


def analyze_thesis(thesis_id: str, agent_results: list[dict[str, Any]]) -> dict[str, Any]:
    verdicts = {r["agent"]: r.get("verdict", "fail") for r in agent_results}
    consensus = len(set(verdicts.values())) == 1
    worst = max(verdicts.values(), key=lambda v: {"pass": 0, "warn": 1, "fail": 2}[v])

    flag_codes_by_agent = {
        r["agent"]: {f["code"] for f in r.get("flags", [])}
        for r in agent_results
    }
    # Codes raised by exactly one agent → discrepancy
    all_codes = set().union(*flag_codes_by_agent.values()) if flag_codes_by_agent else set()
    solo_flags = {
        code: [a for a, codes in flag_codes_by_agent.items() if code in codes]
        for code in all_codes
        if sum(code in codes for codes in flag_codes_by_agent.values()) == 1
    }

    ls_counts = {r["agent"]: r.get("logic_shallow_count", 0) for r in agent_results}

    return {
        "thesis_id": thesis_id,
        "verdicts": verdicts,
        "consensus": consensus,
        "worst_verdict": worst,
        "logic_shallow_counts": ls_counts,
        "solo_flags": solo_flags,
        "agents": agent_results,
    }


def leaderboard(per_thesis: list[dict[str, Any]]) -> dict[str, Any]:
    totals: Counter[str] = Counter()
    per_agent_codes: dict[str, Counter[str]] = defaultdict(Counter)
    for t in per_thesis:
        for agent, n in t["logic_shallow_counts"].items():
            totals[agent] += int(n or 0)
        for r in t["agents"]:
            for f in r.get("flags", []):
                if f.get("is_logic_shallow"):
                    per_agent_codes[r["agent"]][f["code"]] += 1

    winner = totals.most_common(1)[0][0] if totals else None
    return {
        "totals": dict(totals),
        "winner": winner,
        "top_codes_per_agent": {a: c.most_common(5) for a, c in per_agent_codes.items()},
    }


def should_fail(per_thesis: list[dict[str, Any]], threshold: str) -> bool:
    if threshold == "never":
        return False
    rank = SEVERITY_RANK.get(threshold, 3)
    for t in per_thesis:
        for r in t["agents"]:
            for f in r.get("flags", []):
                if SEVERITY_RANK.get(f.get("severity", "low"), 1) >= rank:
                    return True
    return False


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

def render_markdown(report: dict[str, Any]) -> str:
    out: list[str] = []
    out.append(f"# DEPTH4 Thesis Review — {report['generated_at']}\n")
    lb = report["leaderboard"]
    out.append("## Logic-Shallow Leaderboard\n")
    if lb["totals"]:
        rows = sorted(lb["totals"].items(), key=lambda x: -x[1])
        out.append("| Agent | Logic-Shallow Flags |")
        out.append("|---|---:|")
        for a, n in rows:
            star = " 🏆" if a == lb["winner"] else ""
            out.append(f"| `{a}`{star} | {n} |")
    else:
        out.append("_No logic-shallow flags raised._")
    out.append("")

    out.append("## Per-Thesis Results\n")
    for t in report["theses"]:
        out.append(f"### {t['thesis_id']} — worst: **{t['worst_verdict']}** "
                   f"{'✅ consensus' if t['consensus'] else '⚠️ split'}")
        out.append("")
        out.append("| Agent | Verdict | LS count | Latency |")
        out.append("|---|---|---:|---:|")
        for r in t["agents"]:
            out.append(
                f"| `{r['agent']}` | {r.get('verdict','?')} "
                f"| {r.get('logic_shallow_count',0)} "
                f"| {r.get('_latency_ms','?')} ms |"
            )
        if t["solo_flags"]:
            out.append("\n**Solo flags (potential discrepancies):**")
            for code, agents in t["solo_flags"].items():
                out.append(f"- `{code}` — raised only by `{', '.join(agents)}`")
        out.append("\n<details><summary>Full agent output</summary>\n")
        out.append("```json")
        out.append(json.dumps(t["agents"], indent=2, default=str))
        out.append("```\n</details>\n")

    return "\n".join(out)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main_async(args: argparse.Namespace) -> int:
    load_dotenv()
    cfg = PipelineConfig.load(Path(args.config))
    payload = await fetch_payload(cfg, Path(args.fixture) if args.fixture else None)

    theses = payload.get("theses") or payload.get("data") or []
    if isinstance(theses, dict):
        theses = [theses]
    if args.thesis_id:
        theses = [t for t in theses if t.get("id") == args.thesis_id]
    if not theses:
        print("No theses to review.", file=sys.stderr)
        return 0

    per_thesis: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=cfg.timeout_s) as client:
        for thesis in theses:
            results = await asyncio.gather(*[
                run_agent(client, cfg.agents[name], thesis) for name in AGENTS
            ])
            per_thesis.append(analyze_thesis(thesis.get("id", "?"), list(results)))

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "endpoint": cfg.endpoint,
        "thesis_count": len(theses),
        "leaderboard": leaderboard(per_thesis),
        "theses": per_thesis,
    }

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    json_path = REPORTS_DIR / f"thesis_review_{stamp}.json"
    md_path = REPORTS_DIR / f"thesis_review_{stamp}.md"
    json_path.write_text(json.dumps(report, indent=2, default=str))
    md_path.write_text(render_markdown(report))

    print(f"[depth4-review] wrote {json_path}")
    print(f"[depth4-review] wrote {md_path}")
    lb = report["leaderboard"]
    if lb["winner"]:
        print(f"[depth4-review] logic-shallow leader: {lb['winner']} "
              f"({lb['totals'][lb['winner']]} flags)")

    threshold = args.fail_on or cfg.fail_on
    if should_fail(per_thesis, threshold):
        print(f"[depth4-review] FAIL — flags >= severity '{threshold}' found.",
              file=sys.stderr)
        return 1
    return 0


def main() -> None:
    p = argparse.ArgumentParser(description="DEPTH4 3-agent thesis review")
    p.add_argument("--config", default=str(ROOT / "config.yaml"))
    p.add_argument("--fixture", help="Path to a local JSON payload (skips HTTP)")
    p.add_argument("--thesis-id", help="Review only this thesis id")
    p.add_argument("--fail-on", choices=["low", "medium", "high", "never"],
                   help="Override fail_on from config")
    args = p.parse_args()
    sys.exit(asyncio.run(main_async(args)))


if __name__ == "__main__":
    main()
