# Runbook

Operational procedures for the MT5 Adaptive EA Agent Factory. Treat this as the one-page ops doc.

## Daily loops

### Mac: run one local generation

```bash
source .venv/bin/activate
python -m agents.run_loop --gens 1
```

Outputs:
- `strategies/gen_NNN/<candidate>/spec.json`, `strategy.py`, `critic_notes.md`
- `reports/gen_NNN/<candidate>/<SYMBOL>_<TF>/local.json`
- `reports/gen_NNN/summary.md` - Critic's ranking and refinement pointers

### Mac: run until acceptance (autopilot)

```bash
python -m agents.run_loop --gens 20 --stop-on-accept
```

Hard cap: 20 generations. When one passes, the script:
1. Writes `strategies/gen_NNN/<winner>/EA.mq5` via the Translator.
2. Writes `strategies/gen_NNN/<winner>/EA_parity_check.mq5`.
3. Tags `v<gen>.accepted` in git.
4. Prints next-step instructions for the VPS.

### Mac: kill and inspect

Ctrl-C is safe. Partial results stay in the current `gen_NNN/`. Re-run will resume from the next generation.

## VPS: validate a winner

On the Windows VPS (RDP / SSH / directly):

```powershell
cd C:\TRADING         # or wherever the repo lives
git pull
python -m vps.validate --version v7.accepted
```

Steps the validator performs:
1. Compiles `common/include/*.mqh` and `strategies/.../EA.mq5` via `metaeditor64 /compile`. Aborts on error.
2. Runs `terminal64 /config:vps/tester.ini` 4 times (one per symbol/TF combo), every-tick, IS window.
3. Runs walk-forward OOS (6mo-IS / 2mo-OOS rolling) across each combo.
4. Parses XML reports -> `reports/final/v7.accepted/<SYMBOL>_<TF>/{is,oos}.json`.
5. Runs parity diff: `EA_parity_check.mq5` dumps bar-by-bar signals for a fixed slice (e.g. XAUUSD M15 2023-01); compared against the Python strategy's dump.
6. Applies acceptance gate against MT5 numbers. Writes `reports/final/v7.accepted/verdict.md`.
7. Commits and pushes.

Expected wall time: 1-6 hours depending on tick data and hardware.

## Interpreting verdicts

- **PASS, parity OK** -> move to demo-forward on the VPS's live MT5 (Strategy Tester is not forward-trading). Target >= 4 weeks.
- **PASS on MT5 but parity FAIL** -> the Python and MQL5 behave differently. Do not promote. File the divergence as a Critic input and re-run local loop.
- **FAIL on MT5 with > 20% metric divergence from local** -> broker reality diverged from local assumptions. Update `config.yaml` spread/commission/slippage, re-run locally.
- **FAIL on MT5 with similar metrics to local** -> the local loop already judged it borderline. Tighten acceptance or extend OOS and re-run.

## Tuning knobs (`config.yaml`)

- `symbols.xauusd.broker_name` / `symbols.ger40.broker_name` - your broker's exact symbol strings.
- `symbols.*.spread_points` / `slippage_points` / `commission_per_lot` - local realism. Set to match your broker's averages.
- `risk.per_trade_pct` - default 0.5%.
- `risk.daily_dd_kill_pct` - default 3.0%.
- `acceptance.pf_min` / `max_dd_pct` / `sharpe_min` / `trades_min` - the gate.
- `walk_forward.is_months` / `oos_months` - window sizes.
- `llm.provider` / `llm.model` - defaults to Anthropic Claude Sonnet.
- `loop.candidates_per_gen` - default 4.
- `loop.survivors` - default 2.

## Data refresh

History may go stale. Re-export periodically on VPS:

```powershell
python -m agents.data_fetch --symbol XAUUSD --tf M1 --from 2020-01-01 --to today
python -m agents.data_fetch --symbol GER40 --tf M1 --from 2020-01-01 --to today
```

M5 and M15 are aggregated from M1 at backtest time. Parquet cache lives in `data/` and OneDrive-syncs to the Mac.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Local PF looks amazing, MT5 PF is bad | Spread/slippage unrealistic, or MT5 has real ticks vs local has M1 bars | Tighten `config.yaml` friction; ensure data_fetch exported real ticks if available |
| Compilation fails | Include path wrong, missing function | Inspect `metaeditor64` log in `reports/final/.../compile.log`; Translator retries up to 3x |
| Parity diff shows drift | Python and MQL5 primitives out of sync | Rebuild `common/include/*.mqh` from `agents/signals.py` golden values; see Translator notes |
| GER40 has zero trades | Broker symbol name mismatch | Set `symbols.ger40.broker_name` to your broker's string (`DE40`, `DAX40`, `GER40.cash`, ...) |
| Loop hangs on LLM call | API rate limit or key missing | Check `ANTHROPIC_API_KEY`; `llm_client.py` has retries with backoff |

## Safety

- Strategies in `strategies/` and compiled `EA.ex5` are never auto-attached to live accounts. Promotion to live is a manual, deliberate step.
- The VPS validator runs in Strategy Tester only; it cannot place trades.
- The MQL5 Risk include enforces daily-DD kill-switch and SL-required invariants even in live usage.
