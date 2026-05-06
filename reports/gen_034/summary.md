## Generation Review

**Verdict: Full rejection — zero trades across all 4 symbol/TF combos (XAUUSD M5/M15, GER40 M5/M15) over the 2020-01-01 → 2024-06-30 IS window.**

This is not a performance problem; it is a signal-generation failure. The ATR breakout + pullback logic never fired a single entry in ~4.5 years of data on two highly volatile instruments. That points to one or more of:

1. Entry conditions stacked too restrictively (e.g., breakout + pullback + trend filter + session filter all required simultaneously).
2. ATR breakout threshold set far too wide (e.g., >2.0×ATR from prior range high/low) for M5/M15.
3. Pullback retracement tolerance too narrow (e.g., must retrace exactly to breakout level ± tiny buffer).
4. Symbol/point-size or digits handling bug — breakout distance computed in wrong units for XAUUSD (2-digit) vs GER40 (1-digit index CFD).
5. Time/session filter excluding all bars (timezone mismatch between broker server and filter).

With zero trades there is no PF, Sharpe, DD, or consistency to score. Fitness = 0. Candidate does not meet any acceptance threshold (trades_min=200).