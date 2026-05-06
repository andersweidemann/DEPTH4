```mq5
//+------------------------------------------------------------------+
//| Input parameters                                                 |
//+------------------------------------------------------------------+
input string symbol = "XAUUSD";
input string timeframe = "M15";
input datetime start_date = "2023-01-01";
input datetime end_date = "2023-02-01";

//+------------------------------------------------------------------+
//| Global variables                                                 |
//+------------------------------------------------------------------+
int file_handle;

//+------------------------------------------------------------------+
//| Expert initialization function                                  |
//+------------------------------------------------------------------+
int init()
  {
   file_handle = FileOpen("Files\\factory_parity.csv", FILE_WRITE | FILE_CSV);
   if (file_handle < 0)
     {
      printf("Error: %d", GetLastError());
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
   double bb_lower = SigBollinger(Symbol(), Period(), 20, 2.0, MODE_LOWER);
   double bb_upper = SigBollinger(Symbol(), Period(), 20, 2.0, MODE_UPPER);
   double bb_mid = SigBollinger(Symbol(), Period(), 20, 2.0, MODE_MAIN);
   double bb_width = SigBBWidth(Symbol(), Period(), 20, 2.0);
   double rsi = SigRSI(Symbol(), Period(), 7);
   double atr = SigATR(Symbol(), Period(), 14);
   double adx = RegADX(Symbol(), Period(), 14);

   // Check regime
   if (bb_width > RegATRPercentile(Symbol(), Period(), 20, 2.0, 30) && adx < 25)
     {
      // Check entry conditions
      if (Close() < bb_lower && rsi < 15)
        {
         // Calculate stop loss and take profit
         double sl_price = Close() - 1.5 * atr;
         double tp_price = bb_upper;
         double size = RiskLotsByPct(AccountEquity(), 0.5, sl_price, Close(), Symbol());

         // Write to file
         FileWrite(file_handle, TimeToString(TimeCurrent(), TIME_DATE) + "," + TimeToString(TimeCurrent(), TIME_TIME) + "," + DoubleToString(bb_width, 2) + "," + DoubleToString(rsi, 2) + "," + DoubleToString(sl_price, 5) + "," + DoubleToString(tp_price, 5) + "," + DoubleToString(size, 2));
        }
      else if (Close() > bb_upper && rsi > 85)
        {
         // Calculate stop loss and take profit
         double sl_price = Close() + 1.5 * atr;
         double tp_price = bb_lower;
         double size = RiskLotsByPct(AccountEquity(), 0.5, sl_price, Close(), Symbol());

         // Write to file
         FileWrite(file_handle, TimeToString(TimeCurrent(), TIME_DATE) + "," + TimeToString(TimeCurrent(), TIME_TIME) + "," + DoubleToString(bb_width, 2) + "," + DoubleToString(rsi, 2) + "," + DoubleToString(sl_price, 5) + "," + DoubleToString(tp_price, 5) + "," + DoubleToString(size, 2));
        }
     }
  }
```
