## Generation Review: FAILED

All four combos (XAUUSD M5/M15, GER40 M5/M15) produced **zero trades** across the 2020-01-01 to 2024-06-30 IS window. This is not a performance problem, it is a **signal-generation bug**. No fitness can be computed; all metrics are NaN.

### Likely root causes
1. **Session window misconfigured**: London range capture (e.g., 07:00-08:00 UTC) or breakout window (08:00-12:00 UTC) may be gated by broker server time vs UTC mismatch. M5 bars from MT5 typically carry broker TZ (EET/EEST = UTC+2/+3); hardcoded UTC hours would yield empty sessions.
2. **Range definition too strict**: If range requires min pip width or ATR filter, and the check is inverted or uses wrong price scale (XAUUSD 2-digit vs 3-digit, GER40 1-digit vs 2-digit), no bar ever qualifies.
3. **Breakout confirmation never fires**: Entry may require close beyond range + buffer in ticks/points where point-size is wrong for XAUUSD/GER40 (common bug: using 0.0001 pip logic on gold/indices).
4. **Symbol filter excludes both symbols**: e.g., whitelist only 'XAUUSD.raw' or 'DE40', not 'GER40'.
5. **Data availability**: M5/M15 history for GER40 on the test feed may start later than 2020-01-01, but that would still produce some trades in 2021+.

### Recommendation
**Do not tune parameters.** Instrument the strategy: log (a) bars seen per session, (b) ranges formed, (c) breakout triggers evaluated, (d) orders rejected. Fix the signal path, then re-run IS before any optimization.

No pivot of strategy family is warranted yet — London range breakout on XAUUSD/GER40 is a well-documented edge; the candidate never actually got tested.