## Generation Review

**Verdict: REJECT — entire generation fails on the primary target instrument (GER40).**

The sole candidate, `02_ger40_donchian_trend_breakout_m15`, is purpose-built for GER40 but is **net negative on GER40 on both M5 (-6.54%, PF 0.90) and M15 (-6.87%, PF 0.93)**. Its only profitable combos are XAUUSD — and those are suspect:
- XAUUSD M5: PF 3.77 but only **19 trades** → classic small-sample red flag (Sortino=Inf indicates zero downside deviation, meaning essentially no losing streak sampled).
- XAUUSD M15: PF 2.39 on 29 trades — below the 200 trade floor.

Acceptance checks:
- `pf_min=2.0`: FAIL on GER40 combos.
- `sharpe_min=1.5`: FAIL on all combos (best is 0.81).
- `trades_min=200`: FAIL per-combo (max 148).
- `require_all_combos_positive`: FAIL (GER40 negative on both TFs).
- `max_dd_pct=15`: pass, but only because return is negative and exposure low.

**OOS degradation**: No OOS window provided — IS-only results already fail; running OOS is not justified until the strategy is reworked.

**Root cause hypothesis**: Donchian breakouts on DAX intraday (M5/M15) are fighting mean-reversion during EU session chop. 45.9% win rate with PF ~0.93 and exposure >100% on M15 (1.19) suggests overlapping positions and no regime filter. The strategy accidentally works on gold because gold trends cleanly intraday — but sample is too small to trust.

**Recommendation**: Do not parameter-tweak this Donchian variant for GER40. Pivot the family.