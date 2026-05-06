```mq5
//+------------------------------------------------------------------+
//| Input parameters                                                 |
//+------------------------------------------------------------------+
input string strategy_id = "bb_rsi_mean_reversion_v1";
input string family = "mean_reversion";
input string hypothesis = "On XAUUSD M5 and M15, price closes outside Bollinger(20, 2.0) combined with extreme RSI(7) readings revert to the band midline with positive expectancy, provided BB width is above its 30th percentile (filters dead ranges).";
input string symbols[] = {"XAUUSD", "US500"};
input string timeframes[] = {"M5", "M15"};
input int bb_period = 20;
input double bb_dev = 2.0;
input int rsi_period = 7;
input int adx_period = 14;
input double risk_per_trade_pct = 0.5;
input int max_concurrent_positions = 1;
input int time_stop_bars = 30;
input double sl_atr_mult = 1.5;

//+------------------------------------------------------------------+
//| Global variables                                                 |
//+------------------------------------------------------------------+
double bb_lower, bb_upper, bb_mid, bb_width, rsi, atr, adx;
double sl_price, tp_price;
double size;

//+------------------------------------------------------------------+
//| Expert initialization function                                  |
//+------------------------------------------------------------------+
int init()
  {
   return (INIT_SUCCEEDED);
  }
//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void deinit()
  {
  }
//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
  {
   // Calculate indicators
   bb_lower = SigBollinger(Symbol(), Period(), bb_period, bb_dev, MODE_LOWER);
   bb_upper = SigBollinger(Symbol(), Period(), bb_period, bb_dev, MODE_UPPER);
   bb_mid = SigBollinger(Symbol(), Period(), bb_period, bb_dev, MODE_MAIN);
   bb_width = SigBBWidth(Symbol(), Period(), bb_period, bb_dev);
   rsi = SigRSI(Symbol(), Period(), rsi_period);
   atr = SigATR(Symbol(), Period(), adx_period);
   adx = RegADX(Symbol(), Period(), adx_period);

   // Check regime
   if (bb_width > RegATRPercentile(Symbol(), Period(), bb_period, bb_dev, 30) && adx < 25)
     {
      // Check entry conditions
      if (Close() < bb_lower && rsi < 15)
        {
         // Calculate stop loss and take profit
         sl_price = Close() - sl_atr_mult * atr;
         tp_price = bb_upper;
         size = RiskLotsByPct(AccountEquity(), risk_per_trade_pct, sl_price, Close(), Symbol());

         // Send buy order
         if (!OrderSend(Symbol(), OP_BUY, size, Ask, 3, sl_price, tp_price, NULL, 0, 0, Green))
           {
            printf("Error: %d", GetLastError());
           }
        }
      else if (Close() > bb_upper && rsi > 85)
        {
         // Calculate stop loss and take profit
         sl_price = Close() + sl_atr_mult * atr;
         tp_price = bb_lower;
         size = RiskLotsByPct(AccountEquity(), risk_per_trade_pct, sl_price, Close(), Symbol());

         // Send sell order
         if (!OrderSend(Symbol(), OP_SELL, size, Bid, 3, sl_price, tp_price, NULL, 0, 0, Red))
           {
            printf("Error: %d", GetLastError());
           }
        }
     }

   // Manage open orders
   for (int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if (PositionSelect(i))
        {
         if (Time() - PositionOpenTime() > time_stop_bars * Period())
           {
            OrderClose(PositionTicket(), PositionSize(), Bid, 3);
           }
        }
     }
  }
```
