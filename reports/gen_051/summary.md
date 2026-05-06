## Generation Verdict: FAIL (Zero Trades)

The sole candidate `00_xau_bb_rsi_meanrev_m5` produced **0 trades** over the 4.5-year IS window (2020-01-01 to 2024-06-30) on XAUUSD M5. All metrics are NaN/0, meaning the entry logic never fired — this is a specification/implementation failure, not a performance failure.

### Likely root causes
1. **Entry gates too strict**: BB+RSI mean-reversion with compounded filters (e.g., RSI<30 AND close<lower BB AND additional trend/volatility filter) can trivially produce zero hits on M5 XAU if thresholds are mis-scaled for gold's volatility.
2. **Symbol/price scaling bug**: BB stdev multiplier or RSI period may be applied to wrong series, or pip/point conversion is off for XAUUSD (price ~2000, not ~1.2).
3. **Session/time filter** excluding all bars (e.g., TZ mismatch, news filter always-on).
4. **Data feed empty or misaligned** for the symbol on the test harness.

### Recommendation
Do NOT tune parameters further until a smoke test confirms the strategy fires. Instrument the entry function with a counter for each gate. Once trades > 0, reassess whether BB+RSI meanrev on XAU M5 is even viable — gold M5 is trend/momentum-dominated during LDN/NY sessions and chops aggressively elsewhere; pure meanrev typically bleeds. Consider a strategy-family pivot.