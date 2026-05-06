## Generation 02 Critic Report

**Verdict: Full rejection. Strategy-family pivot recommended.**

Candidate `02_cand_2` fails every acceptance gate by a wide margin across all four symbol/TF combos:

| Combo | Trades | PF | Sharpe | MaxDD% | Return% |
|---|---|---|---|---|---|
| XAUUSD M5 | 0 | n/a | n/a | 0.0 | 0.0 |
| XAUUSD M15 | 4 | 0.77 | -0.03 | 2.02 | -0.15 |
| GER40 M5 | 9 | 1.97 | 0.29 | 1.52 | +2.16 |
| GER40 M15 | 18 | 0.94 | -0.01 | 4.05 | -0.09 |

### Gate failures
- **trades_min=200**: total trades = 31 across 4.5 years. Entry logic is far too restrictive (or broken on XAUUSD M5 where it produced zero fills).
- **pf_min=2.0**: only GER40 M5 approaches threshold (1.97) and only over 9 trades — this is statistical noise, not edge.
- **sharpe_min=1.5**: best combo is 0.29. Nothing in the same zip code.
- **require_all_combos_positive**: 3 of 4 combos are flat-to-negative.

### Red flags
- GER40 M5 PF≈2 on 9 trades is the classic small-n mirage — do not chase.
- XAUUSD M5 produced **zero trades** → either the signal never fires on M5 gold or there is a filter/session bug.
- Exposure% is microscopic (0.02–0.17%) → the strategy is barely in the market, confirming over-filtering.

### Recommendation
This is a generation-wide failure, not a tuning problem. Pivot the family rather than nudging parameters.