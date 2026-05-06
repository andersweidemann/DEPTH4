## Generation Verdict: FULL FAILURE

All four candidates fail acceptance. Three (00, 01, 03) produced **zero trades across all four symbol/TF combos** over 4.5 years of IS data — meaning entry logic is either never triggered, gated by contradictory conditions, or the signal formation is miscoded. Candidate 02 is the only one that trades, but it is a **losing strategy on every combo**: PF 0.55–0.83, negative Sharpe (-0.44 to -1.04), max DD up to 24.5% on GER40 M15, and return -2% to -17%. Win rates 41–46% combined with PF<1 indicate payoff ratio is broken (avg winners smaller than avg losers).

### Key failures vs thresholds
- pf_min 2.0: best observed 0.83 (GER40 M15). **Miss by ~60%**.
- sharpe_min 1.5: all negative. **Miss**.
- max_dd_pct 15.0: GER40 M15 at 24.5%. **Miss**.
- trades_min 200: only GER40 M15 (387) clears; XAUUSD M5 has 17 trades (noise).
- require_all_combos_positive: **violated everywhere**.

### Recommendation
Pivot the strategy family. Three of four seed strategies emit no trades — the entry template itself is broken or over-constrained. Candidate 02 trades but has negative edge, suggesting the signal is anti-predictive or fees/slippage dominate. Do not tweak parameters on 00/01/03; rebuild. For 02, consider signal inversion test before discarding, but the expectancy is too negative to salvage with parameter tuning alone.