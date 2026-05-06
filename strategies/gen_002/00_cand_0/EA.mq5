```mq5
//+------------------------------------------------------------------+
//| Input parameters                                                |
//+------------------------------------------------------------------+
input int bb_period = 20;
input double bb_dev = 1.75;
input int rsi_period = 7;
input int rsi_long_thr = 10;
input int rsi_short_thr = 90;
input double atr_sl_mult = 1.5;
input int time_stop_bars_param = 30;
input int bbw_lookback = 500;
input double bbw_pct_thr = 30.0;
input int atr_pct_lookback = 500;
input double atr_pct_min = 0.30;
input double atr_pct_max = 0.90;
input int cooldown_bars = 3;
input double risk_per_trade_pct = 0.5;
input int max_spread_points = 40;

//+------------------------------------------------------------------+
//| Global variables                                                 |
//+------------------------------------------------------------------+
double bb_upper[];
double bb_lower[];
double bb_mid[];
double rsi_series[];
double atr_series[];
double bbw_series[];
double atr_pct_series[];
int last_entry_bar = -10000;

//+------------------------------------------------------------------+
//| Initialization function                                          |
//+------------------------------------------------------------------+
int init()
  {
   // Initialize indicators
   SetIndexBuffer(0, bb_upper);
   SetIndexBuffer(1, bb_lower);
   SetIndexBuffer(2, bb_mid);
   SetIndexBuffer(3, rsi_series);
   SetIndexBuffer(4, atr_series);
   SetIndexBuffer(5, bbw_series);
   SetIndexBuffer(6, atr_pct_series);

   return (INIT_SUCCEEDED);
  }
//+------------------------------------------------------------------+
//| Deinitialization function                                       |
//+------------------------------------------------------------------+
void deinit()
  {
  }
//+------------------------------------------------------------------+
//| Expert deinitialization function                                |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
  }
//+------------------------------------------------------------------+
//| Expert tick function                                            |
//+------------------------------------------------------------------+
void OnTick()
  {
   // Calculate indicators
   int i = 0;
   bb_upper[i] = iBands(Symbol(), Period(), bb_period, bb_dev, MODE_MAIN, PRICE_CLOSE, 0);
   bb_lower[i] = iBands(Symbol(), Period(), bb_period, bb_dev, MODE_LOWER, PRICE_CLOSE, 0);
   bb_mid[i] = iBands(Symbol(), Period(), bb_period, bb_dev, MODE_UPPER, PRICE_CLOSE, 0);
   rsi_series[i] = iRSI(Symbol(), Period(), rsi_period, PRICE_CLOSE, 0);
   atr_series[i] = iATR(Symbol(), Period(), 14, 0);
   bbw_series[i] = (iBands(Symbol(), Period(), bb_period, bb_dev, MODE_UPPER, PRICE_CLOSE, 0) - iBands(Symbol(), Period(), bb_period, bb_dev, MODE_LOWER, PRICE_CLOSE, 0)) / iBands(Symbol(), Period(), bb_period, bb_dev, MODE_MAIN, PRICE_CLOSE, 0);
   atr_pct_series[i] = RegATRPercentile(Symbol(), Period(), 14, atr_pct_lookback);

   // Check entry conditions
   if (Close() < bb_lower[i] && rsi_series[i] < rsi_long_thr && bbw_series[i] > Percentile(bbw_series, bbw_lookback, bbw_pct_thr) && iTime(Symbol(), Period(), 0) >= 70000 && iTime(Symbol(), Period(), 0) <= 200000)
     {
      // Calculate stop loss and take profit
      double sl = Close() - atr_sl_mult * atr_series[i];
      double tp = bb_upper[i];

      // Check if stop loss and take profit are valid
      if (sl >= Close() || tp <= Close())
        return;

      // Calculate position size
      double stop_dist = Close() - sl;
      double lots = RiskLotsByPct(AccountEquity(), risk_per_trade_pct, stop_dist, Symbol());

      // Send buy order
      int ticket = OrderSend(Symbol(), OP_BUY, lots, Ask, 3, sl, tp, "", 0, 0, Green);
     }
   else if (Close() > bb_upper[i] && rsi_series[i] > rsi_short_thr && bbw_series[i] > Percentile(bbw_series, bbw_lookback, bbw_pct_thr) && iTime(Symbol(), Period(), 0) >= 70000 && iTime(Symbol(), Period(), 0) <= 200000)
     {
      // Calculate stop loss and take profit
      double sl = Close() + atr_sl_mult * atr_series[i];
      double tp = bb_lower[i];

      // Check if stop loss and take profit are valid
      if (sl <= Close() || tp >= Close())
        return;

      // Calculate position size
      double stop_dist = sl - Close();
      double lots = RiskLotsByPct(AccountEquity(), risk_per_trade_pct, stop_dist, Symbol());

      // Send sell order
      int ticket = OrderSend(Symbol(), OP_SELL, lots, Bid, 3, sl, tp, "", 0, 0, Red);
     }

   // Manage open positions
   if (PositionSelect(_symbol) == true)
     {
      // Check if position is open for more than time_stop_bars_param bars
      if (iBar(Symbol(), Period(), 0) - PositionGetInteger(POSITION_TIME) >= time_stop_bars_param)
        {
         // Close position
         OrderClose(PositionGetInteger(POSITION_TICKET), Symbol(), PositionGetDouble(POSITION_VOLUME), Bid, 3);
        }
     }
  }
```
