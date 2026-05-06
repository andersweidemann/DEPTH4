---
name: run-iteration
description: Drive a single local generation of the MT5 EA agent factory from Cursor chat. Use when the user asks to run one generation, propose new candidates, or kick the loop.
---

# Run One Iteration of the EA Factory

Use this skill to manually drive one generation of the Mac-local EA factory. For autopilot, use `python -m agents.run_loop --gens N` from the terminal instead.

## Preconditions

- `ANTHROPIC_API_KEY` is set.
- `data/` has XAUUSD and GER40 M1 parquet (run `python -m agents.data_fetch` if not).
- `.venv` is active with `agents/requirements.txt` installed.

## Steps

1. Determine the next gen number by listing `strategies/gen_*/`.
2. (Optional, every 5 gens or on request) Run Scout: `python -m agents.scout --max-results 30`.
3. Run Architect: `python -m agents.run_loop --only architect --gen <N>` (add `--config config/campaigns/ger40_m15.discovery.yaml` when running an M15 single-symbol campaign). Writes `strategies/gen_N/<candidate>/spec.json`.
4. Run Coder: `python -m agents.run_loop --only coder --gen <N>`. Writes `strategy.py` per candidate.
5. Run Risk check: `python -m agents.risk --check-dir strategies/gen_<N>`. Stop on hard failures.
6. Run backtests: `python -m agents.run_loop --only backtest --gen <N>`.
7. Run Critic: `python -m agents.run_loop --only critic --gen <N>`.
8. If any survivor passes acceptance, run Translator: `python -m agents.run_loop --only translate --gen <N>`. Writes `EA.mq5` and `EA_parity_check.mq5`.
9. Commit: `git add -A && git commit -m "gen N"`. Tag `v<N>.accepted` if translation succeeded.

## Stop conditions

- Risk check fails for every candidate: surface to user for review.
- LLM error after retries: stop and surface.
- Acceptance reached: print the VPS next-step from `runbook.md`.

## After acceptance

Tell the user: "Pull the repo on your Windows VPS and run `python -m vps.validate --version v<N>.accepted`."
