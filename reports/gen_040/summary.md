## Generation Verdict: FAIL

**All four combos miss every acceptance gate.** Candidate `00_cand_0` shows PF hovering around 1.0 (0.94-1.06), negative Sharpe on 3 of 4 combos, and max DD up to 24.3% (gate: 15%). The only combo posting a positive return (GER40 M15: +10.4%, PF 1.06) is within noise of breakeven and fails pf_min=2.0 and sharpe_min=1.5.

**Diagnosis:** Win rate clusters at 47-50% with near-zero expectancy (-0.004 to +0.007 per trade). This is a zero-edge signal being churned by costs — classic sign that the entry logic is effectively random on these instruments/TFs. Exposure is low (6-8%), so the problem is edge quality, not sizing.

**Consistency:** 3 of 4 combos negative → `require_all_combos_positive` violated. Cross-symbol behavior diverges (XAUUSD worst, GER40 M15 only positive), suggesting the rule is not regime-robust.

**Recommendation:** Do NOT tweak parameters on this family. Pivot to a different signal premise before burning more compute.