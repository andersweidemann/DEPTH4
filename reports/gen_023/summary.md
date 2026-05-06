## Generation Review

**Verdict: Entire generation rejected.** No candidate approaches acceptance thresholds (pf>=2.0, sharpe>=1.5, dd<=15%, trades>=200 per combo).

### 00_cand_0
- Zero trades across all three symbols on M15. The entry logic is either non-firing or gated by an impossible filter. This is a **signal generation failure**, not an edge problem.

### 02_cand_2
- Does produce trades (2007 total), but edge is absent or negative.
- XAUUSD M5 is the only positive combo (PF 1.06, return +0.11%, Sharpe 0.27) — marginal, likely noise given win_rate 25.8% with PF barely above 1.
- XAUUSD M15, US500 M5, US500 M15 all negative PF<0.91, Sharpe between -0.28 and -0.63.
- `require_all_combos_positive` fails hard.
- Win rates clustered at 22–26% suggest a trend/breakout style with R multiples that aren't compensating — likely TP too close or SL too wide relative to realized MFE/MAE.
- Exposure ~7% is low; strategy is selective but not selective *correctly*.

### Recommendation
Pivot the strategy family. Two generations of near-zero or negative expectancy indicate the hypothesis (as currently parameterized) lacks edge on these instruments/timeframes. Do not tune parameters on 02_cand_2; reformulate the entry trigger.