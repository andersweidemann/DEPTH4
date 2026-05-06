```mq5
//+------------------------------------------------------------------+
//| Input parameters                                                |
//+------------------------------------------------------------------+
input string symbol = "XAUUSD";
input ENUM_TIMEFRAMES timeframe = PERIOD_M15;
input datetime start_date = "2023-01-01";
input datetime end_date = "2023-02-01";

//+------------------------------------------------------------------+
//| Global variables                                                 |
//+------------------------------------------------------------------+
int file_handle;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int init()
  {
   file_handle = FileOpen("Files\\factory_parity.csv", FILE_WRITE|FILE_CSV, ",;");
   if (file_handle != -1)
     {
      FileWrite(file_handle, "time,regime,signal,sl,tp,size");
     }
   return (INIT_SUCCEEDED);
  }
//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void deinit()
  {
   FileClose(file_handle);
  }
//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
  {
   // Calculate indicators
   double lower_bb = iBands(symbol, timeframe, 20, 2.0, MODE_LOWER, 0);
   double upper_bb = iBands(symbol, timeframe, 20, 2.0, MODE_UPPER, 0);
   double mid_bb = iBands(symbol, timeframe, 20, 2.0, MODE_MAIN, 0);
   double rsi_val = iRSI(symbol, timeframe, 7, 0);
   double atr_val = iATR(symbol, timeframe, 14, 0);
   double bbw_pct = (iBands(symbol, timeframe, 20, 2.0, MODE_UPPER, 0) - iBands(symbol, timeframe, 20, 2.0, MODE_LOWER, 0)) / mid_bb;
   bbw_pct = iMAOnArray(bbw_pct, 500, 0, MODE_SMA, PRICE_CLOSE, 0);

   // Regime filter
   bool regime = (bbw_pct >= 30);

   // Entry rules
   bool long_signal = (Close[0] < lower_bb && rsi_val < 15);
   bool short_signal = (Close[0] > upper_bb && rsi_val > 85);

   // Write to file
   if (file_handle != -1)
     {
      string time_str = TimeToString(iTime(symbol, timeframe, 0), TIME_DATE|TIME_SECONDS);
      FileWrite(file_handle, StringFormat("%s,%d,%d,%f,%f,%f", time_str, regime, long_signal || short_signal, 0, 0, 0));
     }
  }
```
