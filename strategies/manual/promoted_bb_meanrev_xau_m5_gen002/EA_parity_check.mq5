```mq5
//+------------------------------------------------------------------+
//| Input parameters                                                |
//+------------------------------------------------------------------+
input string symbol = "XAUUSD";
input int period = 5;
input datetime start_date = "2023.01.01 00:00";
input datetime end_date = "2023.02.01 00:00";

//+------------------------------------------------------------------+
//| Global variables                                                 |
//+------------------------------------------------------------------+
int file_handle;

//+------------------------------------------------------------------+
//| Initialization function                                          |
//+------------------------------------------------------------------+
int init()
  {
   // Open file for writing
   file_handle = FileOpen("Files\\factory_parity.csv", FILE_WRITE | FILE_CSV);

   return (INIT_SUCCEEDED);
  }
//+------------------------------------------------------------------+
//| Deinitialization function                                       |
//+------------------------------------------------------------------+
void deinit()
  {
   // Close file
   FileClose(file_handle);
  }
//+------------------------------------------------------------------+
//| Expert tick function                                            |
//+------------------------------------------------------------------+
void OnTick()
  {
   // Check if current bar is within parity slice
   if (iTime(Symbol(), Period(), 0) >= start_date && iTime(Symbol(), Period(), 0) <= end_date)
     {
      // Calculate indicators
      double bb_upper = iBands(Symbol(), Period(), 20, 1.75, MODE_MAIN, PRICE_CLOSE, 0);
      double bb_lower = iBands(Symbol(), Period(), 20, 1.75, MODE_LOWER, PRICE_CLOSE, 0);
      double rsi_series = iRSI(Symbol(), Period(), 7, PRICE_CLOSE, 0);
      double atr_series = iATR(Symbol(), Period(), 14, 0);
      double bbw_series = (iBands(Symbol(), Period(), 20, 1.75, MODE_UPPER, PRICE_CLOSE, 0) - iBands(Symbol(), Period(), 20, 1.75, MODE_LOWER, PRICE_CLOSE, 0)) / iBands(Symbol(), Period(), 20, 1.75, MODE_MAIN, PRICE_CLOSE, 0);

      // Check entry conditions
      int signal = 0;
      double sl = 0;
      double tp = 0;
      double size = 0;
      if (Close() < bb_lower && rsi_series < 10 && bbw_series > 0.3)
        {
         signal = 1;
         sl = Close() - 1.5 * atr_series;
         tp = bb_upper;
         size = 0.02;
        }
      else if (Close() > bb_upper && rsi_series > 90 && bbw_series > 0.3)
        {
         signal = -1;
         sl = Close() + 1.5 * atr_series;
         tp = bb_lower;
         size = 0.02;
        }

      // Write to file
      FileWrite(file_handle, StringFormat("%s,%d,%d,%f,%f,%f", TimeToString(iTime(Symbol(), Period(), 0), TIME_DATE | TIME_SECONDS), signal, sl, tp, size));
     }
  }
```
