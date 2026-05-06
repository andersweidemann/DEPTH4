## Generation Verdict: TOTAL FAILURE

Both candidates (`02_cand_2`, `03_cand_3`) produced **zero trades** across all four symbol/TF combos (XAUUSD M5/M15, GER40 M5/M15) over the full IS window 2020-01-01 to 2024-06-30. All metrics are NaN/0.

### Root-cause hypothesis
Zero trades across 4.5 years on two highly active instruments at M5/M15 is not a signal-quality issue — it is a **wiring/gating failure**. Likely causes, in order of probability:
1. Entry conditions are logically unsatisfiable (e.g., AND of mutually exclusive conditions, or a threshold that never triggers such as `rsi < 0` or `atr > price`).
2. Session/time filter excludes all bars (wrong broker TZ offset, or session window in UTC vs. server time mismatch).
3. Symbol/TF handle mismatch — indicators requested on a series that returns empty, so `OnTick` returns early.
4. Risk/margin guard rejects every order (e.g., lot size rounds to 0, or min-distance-to-SL check fails).
5. Pending-order logic where the trigger price is always beyond max deviation.

### Recommendation
**Do not tune parameters.** Pivot to diagnostics: add a trade-attempt counter and log rejection reasons (`TRADE_RETCODE_*`, filter-gate booleans) before generating the next candidate batch. Validate that a trivial always-on baseline (`if (Bars%100==0) BuyMarket()`) produces >0 trades on the same harness to confirm the backtest plumbing works.