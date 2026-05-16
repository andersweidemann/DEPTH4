# DEPTH4 — 3-Agent Parallel Thesis Review Pipeline

A pre-commit guardrail for DEPTH4's thesis-formulation logic. Three specialist
LLM reviewers critique every thesis returned by `/api/theses/home-signals` in
parallel, and the pipeline emits a discrepancy report identifying which agent
flags the most reasoning-quality ("logic-shallow") errors.

## Architecture

```
                ┌─────────────────────────────────────┐
                │  GET /api/theses/home-signals       │
                └──────────────┬──────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                │      controller.py          │
                │  (asyncio fan-out, diff)    │
                └──────┬───────┬───────┬──────┘
                       │       │       │
        ┌──────────────┘       │       └──────────────┐
        ▼                      ▼                      ▼
┌───────────────┐    ┌──────────────────┐   ┌──────────────────┐
│ 1. Reasoning  │    │ 2. Market Signal │   │ 3. Long-Term     │
│    Critic     │    │    Validator     │   │    Coherence     │
│ (Claude Opus) │    │   (GPT-4o)       │   │ (Claude Sonnet)  │
└───────────────┘    └──────────────────┘   └──────────────────┘
                       │       │       │
                       ▼       ▼       ▼
                ┌──────────────────────────┐
                │ reports/thesis_review_*  │
                │  .json + .md             │
                │ + logic-shallow ranking  │
                └──────────────────────────┘
```

Each agent operates on the **same** payload but with a different system prompt
and an enforced JSON output contract. The controller fans out with `asyncio`,
parses outputs defensively, computes per-thesis discrepancies (solo flags,
verdict splits), and ranks agents by total logic-shallow flag count.

## Quick start

```bash
cd tools/depth4-thesis-review
cp .env.example .env       # fill in API keys + DEPTH4_BASE_URL
make install               # pip install -r requirements.txt
make install-hooks         # wire .githooks/pre-commit into git (from repo root)

# smoke test (offline, no API calls — exercises the analysis layer)
python3 tests/test_controller.py
python3 tests/test_prompt_taxonomy.py
python3 tests/test_weak_link_reference.py

# real run against a captured payload
python3 controller.py --fixture fixtures/sample_payload.json

# weak-link regression fixture (Eurovision/TLT-style cases)
python3 controller.py --fixture fixtures/weak_link_payload.json --fail-on never

# real run against the live dev server (from repo root, web on :3000)
python3 controller.py
```

Reports are written to `reports/thesis_review_<UTC-timestamp>.{json,md}`.

## Shadow mode (advisory — calibration only)

**Purpose:** Measure how often live thesis↔event links would trigger `LS_TAG_TOO_BROAD` and
`LS_NO_MECHANISM_LINK` using deterministic rules (no LLM cost). Use this for 1–2 weeks to
learn noise levels and repeat offenders before any merge gate.

**Not enforced today:**
- Pre-commit `fail_on` is **not** enabled for shadow or `LS_NO_MECHANISM_LINK`.
- Weekly GitHub Action **never fails** the workflow.
- Optional `--llm` 3-agent pass remains `fail-on never` when used.

**Data source:** `shadow_run.py` reads `public.theses` + recent `thesis_evidence_log`
(`NEWS_DEVELOPMENT`) + `news_events` — **not** `GET /api/theses/home-signals` (that route only
returns `catalogLeader`).

### Run locally against production Supabase

From repo root (requires Vercel/production secrets injected into the process):

```bash
cd signal/apps/web
vercel env run --environment=production -- \
  python3 ../../../tools/depth4-thesis-review/shadow_run.py --days 14 --limit 100 --quiet
```

Or with a pulled env file where secrets are populated:

```bash
cd tools/depth4-thesis-review
python3 shadow_run.py --env-file /path/to/.env --days 14 --limit 100 --quiet
```

**Offline / regression sample** (Eurovision→TLT-style weak links):

```bash
python3 shadow_run.py --fixture fixtures/weak_link_payload.json --quiet
```

### Where reports land

| File | Contents |
|------|----------|
| `reports/shadow_payload_<UTC>.json` | Theses + `matching_event` built for review |
| `reports/shadow_reference_<UTC>.json` | Flag counts, thesis hits, repeat offenders |

Stdout prints a short **editorial summary** (counts + top offending slugs). Pass `--quiet` to
suppress the full JSON dump.

### Summarize shadow reports (Phase 3A.0)

After one or more shadow runs, aggregate weak-link concentration:

```bash
make shadow-summary
# or
python3 summarize_shadow.py --write-json
python3 summarize_shadow.py --report reports/shadow_reference_<UTC>.json
```

Writes `reports/shadow_summary_<UTC>.json` when `--write-json` is set. Joins sibling
`shadow_payload_*.json` for event category, tickers, and `news_events` update paths.

### GitHub Actions (weekly)

Workflow: `.github/workflows/thesis-verifier-shadow.yml` — runs every Monday, uploads
`shadow_reference_*.json` as an artifact, **always succeeds**.

**Repository secrets** (for live production data):

- `NEXT_PUBLIC_SUPABASE_URL` — `https://<project>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (read theses + evidence + news)

If secrets are missing, the job falls back to `fixtures/weak_link_payload.json` and logs a warning.

## Logic-Shallow taxonomy

A flag is "logic-shallow" when the thesis fails a **reasoning-quality** bar,
not just a factual one. Eleven codes are shared across all three agents:

| Code | What it catches |
|---|---|
| `LS_ASSERTION_NO_MECHANISM` | Claim with no stated causal mechanism |
| `LS_MISSING_COUNTERFACTUAL` | No invalidation, or invalidation is trivial |
| `LS_VAGUE_MAGNITUDE` | Direction without size or horizon |
| `LS_SINGLE_DRIVER` | One driver carrying the whole thesis |
| `LS_CORRELATION_AS_CAUSE` | Co-movement cited as causation |
| `LS_HORIZON_MISMATCH` | Evidence horizon ≠ thesis horizon |
| `LS_REGIME_BLIND` | Cites a historical analogue, ignores structural differences |
| `LS_CONSENSUS_PARROT` | Restates consensus without edge |
| `LS_UNFALSIFIABLE` | Thesis cannot be disproven by any observable |
| `LS_PROBABILITY_UNCALIBRATED` | Prose conviction ≠ stated probability |
| `LS_TAG_TOO_BROAD` | Stop-list tag was sole/dominant event-match reason |
| `LS_NO_MECHANISM_LINK` | Event has no semantic cue mapping to stated drivers |

`EVIDENCE_*` codes (`UNVERIFIABLE`, `STALE`, `CONTRADICTS`, `WEAK_LINK`) are reported but
do **not** count toward the logic-shallow tally — they are factual flags.

## Output: per-thesis & global

The report contains, for every thesis:

- **Verdicts** from each agent (`pass` / `warn` / `fail`)
- **Solo flags** — codes raised by exactly one agent (real discrepancies)
- **Logic-shallow counts** per agent

And globally:

- **Leaderboard** — which agent flagged the most `LS_*` codes across the run,
  plus each agent's top-5 most-raised codes

Example header from a Markdown report:

```
## Logic-Shallow Leaderboard
| Agent       | Logic-Shallow Flags |
|-------------|--------------------:|
| reasoning 🏆 | 7                   |
| coherence   | 3                   |
| market      | 1                   |
```

## Editor integrations

### Cursor
`.cursor/rules/depth4-thesis-review.mdc` (repo root) auto-activates when you edit
thesis-formulation paths under `signal/apps/web/`. It tells the agent to run the
pipeline and surface **solo flags** before proposing edits.

### Claude Code
`.claude/commands/review-thesis.md` registers a `/review-thesis [thesis-id]`
slash command. It runs the pipeline, reads the newest report, and replies with
the headline, discrepancies, and top fix.

### Pre-commit hook
`.githooks/pre-commit` runs the pipeline only when staged files touch
thesis-formulation code. The commit is blocked when any flag at the configured
`fail_on` severity (default `high`) is raised. Bypass with `git commit
--no-verify` (use sparingly).

Activate it with `make install-hooks`.

## Configuration

Everything lives in `config.yaml`:

```yaml
endpoint: "/api/theses/home-signals"
fail_on: "high"        # low | medium | high | never
timeout_s: 90
agents:
  reasoning:  { provider: anthropic, model: claude-opus-4-20250514,   ... }
  market:     { provider: openai,    model: gpt-4o-2024-11-20,        ... }
  coherence:  { provider: anthropic, model: claude-sonnet-4-20250514, ... }
```

Swap providers/models freely — the controller is provider-agnostic at the
agent level, so you can route, say, `market` through Kimi or another model
you prefer simply by adding a new branch in `run_agent`.

## Files

```
tools/depth4-thesis-review/
├─ controller.py                 # asyncio fan-out, parsing, diff, leaderboard
├─ config.yaml                   # endpoint, models, severity gate
├─ requirements.txt
├─ Makefile                      # install, install-hooks, review[, -fixture]
├─ .env.example
├─ prompts/
│  ├─ system_base.md             # shared role + JSON contract + taxonomy
│  ├─ agent_reasoning.md
│  ├─ agent_market.md
│  └─ agent_coherence.md
├─ fixtures/sample_payload.json  # offline smoke-test payload
├─ tests/test_controller.py      # offline unit tests, no API needed
├─ reports/                      # generated reports go here
├─ .cursor/rules/thesis-review.mdc
├─ .claude/commands/review-thesis.md
└─ .githooks/pre-commit
```

## Design notes

- **Strict JSON contract** in the shared system prompt prevents output drift
  across providers. The controller still extracts the first JSON object as a
  fallback for unruly models.
- **Severity-aware CI gate**. Default `fail_on: high` means `medium`/`low`
  flags inform without blocking — useful when you want pressure on quality
  without grinding the commit loop.
- **Solo flags = real signal.** Consensus across three independent reviewers
  is cheap. The valuable output is *which* agent saw something the others
  didn't.
- **No live-data fetching from agents.** The Market agent only validates
  against the payload itself, so the pipeline is reproducible offline given
  the same fixture.
