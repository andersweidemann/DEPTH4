## Generation Review

**Verdict: Entire generation failed — 0 trades executed on XAUUSD M5 over 2020-01-01 to 2024-06-30.**

The sole candidate `02_03_03_asia_london_range_breakout_xauusd_` produced zero trades across a 4.5-year IS window. This is not a performance issue — it is a signal-generation failure. Possible root causes:

1. **Session window misconfiguration**: Asia range (e.g., 00:00–07:00 broker time) or London breakout window may be defined in a timezone that never aligns with broker server time, or the range-end time is before range-start.
2. **Range filter too strict**: Min/max range size in pips/points may be filtering out 100% of Asia sessions (e.g., requiring range < 50 pips on XAUUSD where typical Asia range is 300–800 points).
3. **Breakout confirmation condition impossible**: e.g., requiring close beyond range + buffer AND another indicator alignment that never co-occurs.
4. **Symbol/point-size mismatch**: Thresholds written for FX 5-digit pricing but XAUUSD uses 2-digit with different point value.
5. **Order placement logic bug**: pending orders placed but immediately deleted each tick, or expiry too short.

**Recommendation**: Do not tune parameters — instrument the EA with debug logging to confirm (a) Asia range is computed, (b) London breakout trigger is reached, (c) order send returns success. Verify broker timezone offset first.