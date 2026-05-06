# Runbook

Operational procedures for the MT5 Adaptive EA Agent Factory. Treat this as the one-page ops doc.

## Daily loops

### Strategy layout (factory vs frozen)

- **`strategies/gen_NNN/`** — created by `agents.run_loop`; each generation gets a new `gen_*` folder. This is the **factory output tree**.
- **`strategies/manual/`** — hand-authored or tuned strategies (e.g. research EAs). **Not** consumed by `_next_gen_number()`; safe from overwrite by the loop.
- **`strategies/reference/`** — optional **read-only snapshots** of locked configs (e.g. `reference/no_wick_retest_ger40_m30/`) so you keep a copy even if `manual/` edits continue.

The no-wick GER40 M30 locked snapshot lives at **`strategies/reference/no_wick_retest_ger40_m30/`** (copy of `spec.json`, `strategy.py`, `risk_verdict.json`). The editable canonical for backtests remains **`strategies/manual/no_wick_retest_ger40_m30/`** unless you decide otherwise.

## M15 single-symbol campaigns (DAX or Gold)

Use **campaign YAMLs** merged over `config.yaml` so the factory stays on **one symbol and M15**, with **discovery** acceptance first and **strict** acceptance for promotion.

| File | Purpose |
|------|---------|
| `config/campaigns/ger40_m15.discovery.yaml` | GER40 M15, looser IS gate, `require_all_combos_positive: true` (one combo). |
| `config/campaigns/ger40_m15.strict.yaml` | Same matrix, production-style acceptance before translate. |
| `config/campaigns/xauusd_m15.discovery.yaml` | XAUUSD M15 discovery. |
| `config/campaigns/xauusd_m15.strict.yaml` | XAUUSD M15 strict. |

**Matrix lock:** `factory_backtest_symbols` forces IS/OOS backtests to those symbols and `timeframes` from config, even if a spec JSON is sloppy. **Architect + Critic** receive `campaign.architect_brief` hard constraints.

**Discovery → strict workflow**

1. Run discovery until you get survivors you trust (critic notes, sane trade counts):
   ```bash
   python -m agents.run_loop --gens 25 --config config/campaigns/ger40_m15.discovery.yaml
   ```
2. Switch overlay to strict and continue (or re-run from next gen with `--stop-on-accept`):
   ```bash
   python -m agents.run_loop --gens 40 --stop-on-accept --config config/campaigns/ger40_m15.strict.yaml
   ```
3. Optional hunt mode (looser IS screen, collects `reports/factory_hunt/hunt_result.json`):
   ```bash
   python -m agents.factory_hunt --max-gens 20 --target 2 --config config/campaigns/xauusd_m15.discovery.yaml
   ```

**Environment:** `TRADING_CONFIG_OVERLAY=config/campaigns/ger40_m15.discovery.yaml` is equivalent to passing `--config` (useful for `./scripts/factory_loop.sh`).

**Parameter calibration (frozen `strategy.py`):** after the LLM proposes a structure, run random sweeps on `spec.json` numeric fields:

```bash
python -m agents.param_sweep --dir strategies/manual/your_candidate \\
  --recipe config/campaigns/examples/param_sweep_recipe.yaml \\
  --out reports/param_sweeps/run01 --config config/campaigns/ger40_m15.discovery.yaml
```

**LLM quality:** for best Architect/Coder output, set `llm.provider` / `llm.model` in base `config.yaml` (e.g. Anthropic) or override in a small private overlay; campaign files already lower `temperature` slightly during M15 runs.

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

Same from repo root via helper:

```bash
./scripts/factory_loop.sh 20 --stop-on-accept
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
- `acceptance.pf_min` / `return_cagr_pct_min` / `max_dd_pct` / `sharpe_min` / `trades_min` - the gate. (`pf_min` is exclusive: PF must be **strictly greater** than this value. `return_cagr_pct_min` is CAGR % from the window and each combo's total return.)
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
