```mq5
//+------------------------------------------------------------------+
//| Input parameters                                                |
//+------------------------------------------------------------------+
input string symbol = "XAUUSD";
input ENUM_TIMEFRAMES timeframe = PERIOD_M15;
input int bb_period = 20;
input double bb_dev = 2.0;
input int rsi_period = 7;
input int atr_period = 14;
input int bbw_lookback = 500;
input int time_stop = 30;
input double sl_atr_mult = 1.8;
input double risk_pct = 0.5;

//+------------------------------------------------------------------+
//| Global variables                                                 |
//+------------------------------------------------------------------+
double lower_bb, upper_bb, mid_bb, rsi_val, atr_val, bbw_pct;
int bars_open;
double sl_price, tp_price;
int ticket;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
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
   lower_bb = iBands(symbol, timeframe, bb_period, bb_dev, MODE_LOWER, 0);
   upper_bb = iBands(symbol, timeframe, bb_period, bb_dev, MODE_UPPER, 0);
   mid_bb = iBands(symbol, timeframe, bb_period, bb_dev, MODE_MAIN, 0);
   rsi_val = iRSI(symbol, timeframe, rsi_period, 0);
   atr_val = iATR(symbol, timeframe, atr_period, 0);
   bbw_pct = (iBands(symbol, timeframe, bb_period, bb_dev, MODE_UPPER, 0) - iBands(symbol, timeframe, bb_period, bb_dev, MODE_LOWER, 0)) / mid_bb;
   bbw_pct = iMAOnArray(bbw_pct, bbw_lookback, 0, MODE_SMA, PRICE_CLOSE, 0);

   // Regime filter
   if (bbw_pct < 30)
     {
      if (PositionSelect(_Symbol) != -1)
        {
         int type = PositionGetInteger(POSITION_TYPE);
         if (type == OP_BUY)
           {
            OrderClose(ticket, symbol, OP_BUY, Ask, 3, Green);
           }
         else if (type == OP_SELL)
           {
            OrderClose(ticket, symbol, OP_SELL, Bid, 3, Red);
           }
        }
      return;
     }

   // Entry rules
   if (Close[0] < lower_bb && rsi_val < 15)
     {
      // Long entry
      sl_price = Close[0] - sl_atr_mult * atr_val;
      tp_price = 0;
      double lots = RiskLotsByPct(risk_pct, sl_atr_mult * atr_val);
      if (lots > 0)
        {
         ticket = OrderSend(symbol, OP_BUY, lots, Ask, 3, sl_price, tp_price, "Long Entry", 0, 0, Green);
        }
     }
   else if (Close[0] > upper_bb && rsi_val > 85)
     {
      // Short entry
      sl_price = Close[0] + sl_atr_mult * atr_val;
      tp_price = 0;
      double lots = RiskLotsByPct(risk_pct, sl_atr_mult * atr_val);
      if (lots > 0)
        {
         ticket = OrderSend(symbol, OP_SELL, lots, Bid, 3, sl_price, tp_price, "Short Entry", 0, 0, Red);
        }
     }

   // Manage open positions
   if (PositionSelect(_Symbol) != -1)
     {
      int type = PositionGetInteger(POSITION_TYPE);
      if (type == OP_BUY)
        {
         if (Close[0] >= mid_bb || Close[0] >= upper_bb)
           {
            OrderClose(ticket, symbol, OP_BUY, Ask, 3, Green);
           }
        }
      else if (type == OP_SELL)
        {
         if (Close[0] <= mid_bb || Close[0] <= lower_bb)
           {
            OrderClose(ticket, symbol, OP_SELL, Bid, 3, Red);
           }
        }

      // Time stop
      bars_open = iBar(symbol, timeframe, 0);
      if (bars_open >= time_stop)
        {
         OrderClose(ticket, symbol, OP_BUY, Ask, 3, Green);
         OrderClose(ticket, symbol, OP_SELL, Bid, 3, Red);
        }
     }
  }
```
