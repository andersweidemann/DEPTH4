MT5 install (No-wick GER40 M30 promoted EA)
==========================================

1) MetaEditor: File -> Open Data Folder
2) Copy from this repo:
   - mql5/Include/Risk.mqh          -> MQL5/Include/Risk.mqh
   - strategies/manual/promoted_nowick_ger40_m30_pf154/EA.mq5
        -> MQL5/Experts/ (or a subfolder) / EA.mq5
   - Optional: EA_parity_check.mq5 -> same Experts folder

3) Compile EA.mq5. Attach to GER40 (or DE40) chart, timeframe M30.

4) Inputs match spec.json PF~1.98 snapshot (sl_buffer_points 2.5, tp_r_mult 3.4, ...).
   Adjust InpServerToBerlinMin so session 09:30-18:00 matches Python Europe/Berlin
   if your server time is UTC.

5) Differences vs Python backtesting.py: broker fills, point/tick model, H1 bar
   alignment vs pandas resample, ATR percentile tie-breaks, pending limit may not fill.

spec.json in this folder uses sl_buffer_points 2.5 to align with that IS run.
