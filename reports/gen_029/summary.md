## Generation Verdict: TOTAL FAILURE

All three candidates effectively produced zero trades across the 4.5-year IS window (2020-01-01 to 2024-06-30) on all four symbol/TF combos. Only `01_bbrsimeanreversion` managed a single trade on XAUUSD M5 (1 trade, 100% win, meaningless statistically). This is not a parameter tuning problem — it is an **entry-logic wiring / data-feed / signal-gating defect**.

### Probable root causes (in priority order)
1. **Session/time filters too restrictive or timezone-misaligned** — Asia/London breakout and ORB strategies are highly session-dependent; if the broker server time offset is not applied, the session windows never open.
2. **Entry gates stacked multiplicatively** (e.g., ATR expansion AND volume AND BB band AND RSI extreme) so the joint probability of trigger is near zero.
3. **Symbol/TF routing bug** — US500 ORB was tested against XAUUSD/GER40 only; US500 was never actually run. Same likely for GER40 on a XAUUSD-named strategy.
4. **Threshold units mismatch** — e.g., ATR threshold specified in price but compared to points, or BB std-dev set to 3.0+ on M5 where touches are rare.

### Recommendation
Do **not** iterate parameters on these three candidates. Pivot the generation: fix the harness first (verify non-zero signal counts at the indicator layer before gating), then replace the family mix.