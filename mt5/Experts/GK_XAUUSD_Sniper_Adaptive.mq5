//+------------------------------------------------------------------+
//|                              GK_XAUUSD_Sniper_Adaptive.mq5     |
//| Converted from TradingView "GK XAUUSD Sniper Adaptive"         |
//| Evaluates on last completed bar (Pine barstate.isconfirmed).   |
//+------------------------------------------------------------------+
#property copyright   "GK Sniper — TV port"
#property link        ""
#property version     "1.02"

#include <Trade\Trade.mqh>

CTrade trade;

//--- inputs (match Pine defaults)
input int    InpMainLen           = 25;
input int    InpFastLen           = 9;
input int    InpEmaBiasLen        = 200;
input int    InpAtrLen            = 14;
input int    InpStructureLookback = 5;
input int    InpSlopeLookback     = 2;
input int    InpPullbackWindow    = 2;
input double InpMinBodyATR        = 0.18;
input double InpMinSlopeATR       = 0.08;
input double InpMinSepATR         = 0.08;
input double InpMaxStretchATR     = 1.25;
input double InpChopThreshATR     = 0.16;
input int    InpScoreToPrint      = 3;
input double InpTpMove            = 11.0;   // price distance (same units as TV for XAU)

input double InpLots              = 0.10;
input bool   InpUseBalancePctLot  = false;   // true: InpBalancePctForLot sizes volume (see comment)
// If SL > 0: target max loss at SL = this % of ACCOUNT_BALANCE. If SL = 0: target initial margin ≈ this % of balance.
input double InpBalancePctForLot  = 1.0;     // e.g. 1.0 = 1% of balance

input ulong  InpMagic             = 2025042701;
input int    InpSlippagePoints    = 30;
input string InpTradeComment      = "GK Sniper";

input bool   InpAllowBuy          = true;
input bool   InpAllowSell         = true;
input bool   InpOnePositionTotal  = true;   // one net position per symbol like TV "one print"

//--- drawdown control (defaults = off, same behaviour as original no-SL)
// Wide ATR stop clips tail risk only; TP stays InpTpMove. Use 6–12 on XAU for a loose "disaster" floor.
input double InpSlAtrMult         = 0.0;    // 0 = no SL. Else SL distance = ATR(14) * this at entry
// After price moves this fraction of TP in your favour, pull SL to break-even (reduces give-back; TP unchanged).
input double InpBreakEvenFrac     = 0.0;    // 0 = off. Try 0.45–0.55 if you want BE without touching TP

//--- bar buffer
#define COPY_BARS 800

datetime g_lastBarTime = 0;

//--- persistent TV state
int    g_trendDir      = 0;
bool   g_trendPrinted  = false;
double   g_entryPrice   = 0.0;
datetime g_entryBarTime = 0;
int      g_tradeDir     = 0;
bool     g_tpDone       = false;

int       g_weeklySignals = 0;
int       g_weeklyTpHits  = 0;
datetime  g_lastW1Open   = 0;
int       g_atrHandle    = INVALID_HANDLE;

//+------------------------------------------------------------------+
int OnInit()
  {
   trade.SetExpertMagicNumber((int)InpMagic);
   trade.SetDeviationInPoints(InpSlippagePoints);
   long fill = SymbolInfoInteger(_Symbol, SYMBOL_FILLING_MODE);
   if((fill & SYMBOL_FILLING_IOC) != 0)
      trade.SetTypeFilling(ORDER_FILLING_IOC);
   else if((fill & SYMBOL_FILLING_FOK) != 0)
      trade.SetTypeFilling(ORDER_FILLING_FOK);
   else
      trade.SetTypeFilling(ORDER_FILLING_RETURN);

   g_atrHandle = iATR(_Symbol, PERIOD_CURRENT, InpAtrLen);
   if(g_atrHandle == INVALID_HANDLE)
     {
      Print("iATR failed");
      return(INIT_FAILED);
     }
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   if(g_atrHandle != INVALID_HANDLE)
      IndicatorRelease(g_atrHandle);
  }

//+------------------------------------------------------------------+
bool IsNewBar()
  {
   datetime t = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(t == 0) return false;
   if(t != g_lastBarTime)
     {
      g_lastBarTime = t;
      return true;
     }
   return false;
  }

//+------------------------------------------------------------------+
double EmaAlpha(const int len) { return 2.0 / (len + 1.0); }

//+------------------------------------------------------------------+
// Pine ta.ema on series, oldest->newest indexing in arrays
void BuildEma(const double &src[], const int count, const int len, double &ema[])
  {
   if(count < 2 || len < 1) return;
   double a = EmaAlpha(len);
   // series array: index 0 = newest bar in block; compute from oldest index count-1
   int oldest = count - 1;
   ema[oldest] = src[oldest];
   for(int i = oldest - 1; i >= 0; i--)
      ema[i] = a * src[i] + (1.0 - a) * ema[i + 1];
  }

//+------------------------------------------------------------------+
bool CopyRatesBlock(MqlRates &rates[], const int need)
  {
   ArraySetAsSeries(rates, true);
   int got = CopyRates(_Symbol, PERIOD_CURRENT, 0, need, rates);
   return(got >= need);
  }

//+------------------------------------------------------------------+
bool HasOurPosition()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)InpMagic) continue;
      return true;
     }
   return false;
  }

//+------------------------------------------------------------------+
bool GetOurPositionTicket(ulong &ticketOut)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)InpMagic) continue;
      ticketOut = ticket;
      return true;
     }
   return false;
  }

//+------------------------------------------------------------------+
double AtrAtShift1()
  {
   double buf[];
   ArraySetAsSeries(buf, true);
   if(CopyBuffer(g_atrHandle, 0, 1, 1, buf) < 1)
      return 0.0;
   return buf[0];
  }

//+------------------------------------------------------------------+
double NormalizeVolumeDown(const double volume)
  {
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0.0)
      step = 0.01;
   double v = MathFloor(volume / step + 1e-12) * step;
   if(v < vmin)
      v = vmin;
   if(v > vmax)
      v = vmax;
   return v;
  }

//+------------------------------------------------------------------+
double LotsForOrder(const ENUM_ORDER_TYPE orderType, const double priceOpen, const double slPrice)
  {
   if(!InpUseBalancePctLot)
      return NormalizeVolumeDown(InpLots);

   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   if(bal <= 0.0 || InpBalancePctForLot <= 0.0)
      return NormalizeVolumeDown(InpLots);

   double budget = bal * InpBalancePctForLot / 100.0;
   double lot = InpLots;

   if(slPrice > 0.0)
     {
      double profit1 = 0.0;
      if(!OrderCalcProfit(orderType, _Symbol, 1.0, priceOpen, slPrice, profit1))
         return NormalizeVolumeDown(InpLots);
      double lossAbs = MathAbs(profit1);
      if(lossAbs < 1e-12)
         return NormalizeVolumeDown(InpLots);
      lot = budget / lossAbs;
     }
   else
     {
      double margin1 = 0.0;
      if(!OrderCalcMargin(orderType, _Symbol, 1.0, priceOpen, margin1))
         return NormalizeVolumeDown(InpLots);
      if(margin1 <= 1e-12)
         return NormalizeVolumeDown(InpLots);
      lot = budget / margin1;
     }

   return NormalizeVolumeDown(lot);
  }

//+------------------------------------------------------------------+
// Pull SL to break-even once unrealized profit >= InpTpMove * InpBreakEvenFrac (runs every tick).
void ManageBreakEvenStops()
  {
   if(InpBreakEvenFrac <= 0.0)
      return;

   ulong ticket = 0;
   if(!GetOurPositionTicket(ticket))
      return;

   if(!PositionSelectByTicket(ticket))
      return;

   long   type   = PositionGetInteger(POSITION_TYPE);
   double openPx = PositionGetDouble(POSITION_PRICE_OPEN);
   double sl     = PositionGetDouble(POSITION_SL);
   double tp     = PositionGetDouble(POSITION_TP);
   double bid    = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask    = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   int    dg     = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double pt     = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   long   freeze = (long)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_FREEZE_LEVEL);
   long   lvl    = (long)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double minDist = (double)MathMax(freeze, lvl) * pt;

   double trigger = InpTpMove * InpBreakEvenFrac;

   if(type == POSITION_TYPE_BUY)
     {
      if(bid < openPx + trigger)
         return;
      if(sl > 0.0 && MathAbs(sl - openPx) < 10.0 * pt)
         return;
      double beSl = NormalizeDouble(openPx, dg);
      if(bid - beSl < minDist)
         beSl = NormalizeDouble(bid - minDist, dg);
      if(sl > 0.0 && beSl <= sl + pt * 2.0)
         return;
      if(beSl >= bid - pt)
         return;
      if(!trade.PositionModify(ticket, beSl, tp))
         Print("BE modify buy failed ret=", trade.ResultRetcode());
     }
   else if(type == POSITION_TYPE_SELL)
     {
      if(ask > openPx - trigger)
         return;
      if(sl > 0.0 && MathAbs(sl - openPx) < 10.0 * pt)
         return;
      double beSl = NormalizeDouble(openPx, dg);
      if(beSl - ask < minDist)
         beSl = NormalizeDouble(ask + minDist, dg);
      if(sl > 0.0 && beSl >= sl - pt * 2.0)
         return;
      if(beSl <= ask + pt)
         return;
      if(!trade.PositionModify(ticket, beSl, tp))
         Print("BE modify sell failed ret=", trade.ResultRetcode());
     }
  }

//+------------------------------------------------------------------+
// barssince: bars back from `fromIdx` until cond true; -1 if not found within maxBack
int BarSinceTrue(const bool &cond[], const int fromIdx, const int maxBack, const int total)
  {
   for(int b = 0; b <= maxBack && fromIdx + b < total; b++)
     {
      if(cond[fromIdx + b])
         return b;
     }
   return -1;
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   if(HasOurPosition())
      ManageBreakEvenStops();

   if(!IsNewBar())
      return;

   MqlRates rates[];
   if(!CopyRatesBlock(rates, COPY_BARS))
      return;

   const int N = ArraySize(rates);
   if(N < InpEmaBiasLen + InpAtrLen + 20)
      return;
   if(BarsCalculated(g_atrHandle) < InpEmaBiasLen + InpAtrLen + 5)
      return;

   // signal bar = index 1 (just closed)
   const int s = 1;

   //--- ZLEMA adjustment arrays (same indexing as rates: 0=newest)
   int lagMain = (int)MathFloor((InpMainLen - 1) / 2.0);
   int lagFast = (int)MathFloor((InpFastLen - 1) / 2.0);

   double mainAdj[];
   double fastAdj[];
   ArrayResize(mainAdj, N);
   ArrayResize(fastAdj, N);
   ArrayInitialize(mainAdj, 0.0);
   ArrayInitialize(fastAdj, 0.0);

   for(int i = 0; i < N; i++)
     {
      double c = rates[i].close;
      if(lagMain > 0 && i + lagMain < N)
         mainAdj[i] = c + (c - rates[i + lagMain].close);
      else
         mainAdj[i] = c;

      if(lagFast > 0 && i + lagFast < N)
         fastAdj[i] = c + (c - rates[i + lagFast].close);
      else
         fastAdj[i] = c;
     }

   double mainLine[];
   double fastLine[];
   ArrayResize(mainLine, N);
   ArrayResize(fastLine, N);
   BuildEma(mainAdj, N, InpMainLen, mainLine);
   BuildEma(fastAdj, N, InpFastLen, fastLine);

   //--- ATR at signal bar (MT5 iATR = Wilder; matches Pine ta.atr closely)
   double atrBuf[];
   ArraySetAsSeries(atrBuf, true);
   if(CopyBuffer(g_atrHandle, 0, s, 1, atrBuf) < 1)
      return;
   double atr = atrBuf[0];
   if(atr <= 0.0)
      return;

   //--- EMA bias (on close)
   double emaBiasArr[];
   ArrayResize(emaBiasArr, N);
   double closeArr[];
   ArrayResize(closeArr, N);
   for(int j = 0; j < N; j++)
      closeArr[j] = rates[j].close;
   BuildEma(closeArr, N, InpEmaBiasLen, emaBiasArr);
   double emaBias = emaBiasArr[s];

   //--- OHLC shorthand at signal bar (index s)
   double O = rates[s].open, H = rates[s].high, L = rates[s].low, C = rates[s].close;
   double C1 = rates[s + 1].close;
   double H1 = rates[s + 1].high;
   double L1 = rates[s + 1].low;

   double main0 = mainLine[s];
   double main1 = mainLine[s + 1];
   double fast0 = fastLine[s];
   double fast1 = fastLine[s + 1];

   int slb = InpSlopeLookback;
   if(s + slb >= N)
      return;
   double mainSlope = main0 - mainLine[s + slb];
   double fastSlope = fast0 - fast1;
   double sep = MathAbs(fast0 - main0);

   bool bullSlopeOk = mainSlope > atr * InpMinSlopeATR;
   bool bearSlopeOk = mainSlope < -atr * InpMinSlopeATR;
   bool bullSepOk   = fast0 > main0 && sep > atr * InpMinSepATR;
   bool bearSepOk   = fast0 < main0 && sep > atr * InpMinSepATR;
   bool bullBias    = C > emaBias;
   bool bearBias    = C < emaBias;

   bool bullTrend = C > main0 && fast0 > main0 && bullSlopeOk;
   bool bearTrend = C < main0 && fast0 < main0 && bearSlopeOk;

   double bodySize = MathAbs(C - O);
   bool bodyStrong = bodySize > atr * InpMinBodyATR;
   double rangeBar = H - L;
   bool bullCandle = C > O && C >= H - rangeBar * 0.35;
   bool bearCandle = C < O && C <= L + rangeBar * 0.35;

   bool bullExpansion = C > H1 && bullCandle && bodyStrong;
   bool bearExpansion = C < L1 && bearCandle && bodyStrong;

   // prevHigh / prevLow: Pine ta.highest(...)[1] on signal bar
   int Lstr = InpStructureLookback;
   if(s + Lstr + 1 >= N)
      return;
   double prevHigh = rates[s + 1].high;
   double prevLow  = rates[s + 1].low;
   for(int k = 2; k <= Lstr; k++)
     {
      prevHigh = MathMax(prevHigh, rates[s + k].high);
      prevLow  = MathMin(prevLow,  rates[s + k].low);
     }

   bool bullBreak = C > prevHigh || H > prevHigh;
   bool bearBreak = C < prevLow || L < prevLow;

   bool bullPullbackTouch = L <= fast0 || L <= main0 || C <= fast0;
   bool bearPullbackTouch = H >= fast0 || H >= main0 || C >= fast0;

   // precompute touch arrays for barssince (only need up to pullbackWindow+5 from s)
   int maxTouchScan = 80;
   bool bullTouchArr[];
   bool bearTouchArr[];
   ArrayResize(bullTouchArr, N);
   ArrayResize(bearTouchArr, N);
   ArrayInitialize(bullTouchArr, false);
   ArrayInitialize(bearTouchArr, false);
   for(int u = 0; u < N && u < maxTouchScan; u++)
     {
      int idx = s + u;
      if(idx >= N) break;
      double m = mainLine[idx], f = fastLine[idx];
      bullTouchArr[u] = (rates[idx].low <= f || rates[idx].low <= m || rates[idx].close <= f);
      bearTouchArr[u] = (rates[idx].high >= f || rates[idx].high >= m || rates[idx].close >= f);
     }

   int barsSinceBullTouch = BarSinceTrue(bullTouchArr, 0, MathMax(InpPullbackWindow + 5, 60), maxTouchScan);
   int barsSinceBearTouch = BarSinceTrue(bearTouchArr, 0, MathMax(InpPullbackWindow + 5, 60), maxTouchScan);

   bool recentBullTouch = (barsSinceBullTouch >= 0 && barsSinceBullTouch <= InpPullbackWindow);
   bool recentBearTouch = (barsSinceBearTouch >= 0 && barsSinceBearTouch <= InpPullbackWindow);

   bool coCloseFast = (C > fast0 && C1 <= fast1);
   bool cuCloseFast = (C < fast0 && C1 >= fast1);
   bool coFastMain  = (fast0 > main0 && fast1 <= main1);
   bool cuFastMain  = (fast0 < main0 && fast1 >= main1);

   bool bullReclaim = coCloseFast || (C > fast0 && C1 <= fast1) || coFastMain;
   bool bearReject = cuCloseFast || (C < fast0 && C1 >= fast1) || cuFastMain;

   double rangeNow = rates[s].high;
   double low5 = rates[s].low;
   for(int r = 1; r < 5 && s + r < N; r++)
     {
      rangeNow = MathMax(rangeNow, rates[s + r].high);
      low5     = MathMin(low5,     rates[s + r].low);
     }
   bool notChoppy = (rangeNow - low5) > atr * InpChopThreshATR;

   bool bullStretch = MathAbs(C - main0) <= atr * InpMaxStretchATR;
   bool bearStretch = MathAbs(C - main0) <= atr * InpMaxStretchATR;

   bool bullMomentum = fastSlope > 0 && C > C1;
   bool bearMomentum = fastSlope < 0 && C < C1;

   int buyScore = 0;
   if(bullTrend) buyScore++;
   if(bullSepOk) buyScore++;
   if(bullBias) buyScore++;
   if(bullExpansion) buyScore++;
   if(bullBreak) buyScore++;
   if(recentBullTouch && bullReclaim) buyScore++;
   if(notChoppy) buyScore++;
   if(bullStretch) buyScore++;
   if(bullMomentum) buyScore++;

   int sellScore = 0;
   if(bearTrend) sellScore++;
   if(bearSepOk) sellScore++;
   if(bearBias) sellScore++;
   if(bearExpansion) sellScore++;
   if(bearBreak) sellScore++;
   if(recentBearTouch && bearReject) sellScore++;
   if(notChoppy) sellScore++;
   if(bearStretch) sellScore++;
   if(bearMomentum) sellScore++;

   bool impulseBuy = bullTrend && bullSepOk && bullExpansion && bullBias && bullMomentum && notChoppy;
   bool impulseSell = bearTrend && bearSepOk && bearExpansion && bearBias && bearMomentum && notChoppy;

   bool pullbackBuy = bullTrend && recentBullTouch && bullReclaim && bullCandle && bodyStrong && bullStretch && bullMomentum && notChoppy;
   bool pullbackSell = bearTrend && recentBearTouch && bearReject && bearCandle && bodyStrong && bearStretch && bearMomentum && notChoppy;

   bool rawBuy = impulseBuy || pullbackBuy || (buyScore >= InpScoreToPrint);
   bool rawSell = impulseSell || pullbackSell || (sellScore >= InpScoreToPrint);

   bool bullFlip = bullTrend && bullMomentum;
   bool bearFlip = bearTrend && bearMomentum;

   int td = g_trendDir;
   if(td == 0 && bullTrend) td = 1;
   if(td == 0 && bearTrend) td = -1;
   bool newBullTrend = bullFlip && td != 1;
   bool newBearTrend = bearFlip && td != -1;
   if(newBullTrend) td = 1;
   else if(newBearTrend) td = -1;
   g_trendDir = td;

   if(newBullTrend || newBearTrend)
      g_trendPrinted = false;

   bool buyAllowed  = (g_trendDir == 1 || bullTrend) && !g_trendPrinted;
   bool sellAllowed = (g_trendDir == -1 || bearTrend) && !g_trendPrinted;

   bool gkBuy  = rawBuy && buyAllowed;
   bool gkSell = rawSell && sellAllowed;

   if(gkBuy || gkSell)
      g_trendPrinted = true;

   bool finalBuy  = (C > main0 && bullCandle && gkBuy);
   bool finalSell = (C < main0 && bearCandle && gkSell);

   //--- TP tracking (TV labels) — also used for weekly HUD
   if(finalBuy || finalSell)
     {
      g_entryPrice = C;
      g_entryBarTime = rates[s].time;
      g_tradeDir = finalBuy ? 1 : -1;
      g_tpDone = false;
     }

   bool afterEntry = (g_entryBarTime > 0 && rates[s].time > g_entryBarTime);
   bool buyTP  = afterEntry && g_tradeDir == 1 && !g_tpDone && H >= g_entryPrice + InpTpMove;
   bool sellTP = afterEntry && g_tradeDir == -1 && !g_tpDone && L <= g_entryPrice - InpTpMove;
   if(buyTP || sellTP)
      g_tpDone = true;

   //--- weekly stats (align with Pine time("W") — use W1 bar open)
   datetime w1Open = iTime(_Symbol, PERIOD_W1, 0);
   if(w1Open == 0) w1Open = iTime(_Symbol, PERIOD_W1, 1);
   if(g_lastW1Open != 0 && w1Open != g_lastW1Open)
     {
      g_weeklySignals = 0;
      g_weeklyTpHits = 0;
     }
   g_lastW1Open = w1Open;
   if(finalBuy || finalSell)
      g_weeklySignals++;
   if(buyTP || sellTP)
      g_weeklyTpHits++;

   double tpScore = (g_weeklySignals > 0) ? (100.0 * g_weeklyTpHits / g_weeklySignals) : 0.0;

   //--- trading
   if(InpOnePositionTotal && HasOurPosition())
     {
      // mirror TV one-print discipline; HUD still updates
     }
   else
     {
      if(finalBuy && InpAllowBuy)
        {
         int    dg  = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
         double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         double tp  = NormalizeDouble(ask + InpTpMove, dg);
         double sl  = 0.0;
         if(InpSlAtrMult > 0.0)
           {
            double atrEntry = AtrAtShift1();
            if(atrEntry > 0.0)
              {
               double dist = atrEntry * InpSlAtrMult;
               sl = NormalizeDouble(ask - dist, dg);
               double pt = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
               long   lvl = (long)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
               if(lvl > 0 && (ask - sl) < (double)lvl * pt)
                  sl = NormalizeDouble(ask - (double)lvl * pt, dg);
               if(sl >= ask || sl <= 0.0)
                  sl = 0.0;
              }
           }
         double lotsBuy = LotsForOrder(ORDER_TYPE_BUY, ask, sl);
         if(!trade.Buy(lotsBuy, _Symbol, ask, sl, tp, InpTradeComment))
            Print("Buy failed: ", GetLastError(), " retcode ", trade.ResultRetcode());
        }
      else if(finalSell && InpAllowSell)
        {
         int    dg  = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
         double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         double tp  = NormalizeDouble(bid - InpTpMove, dg);
         double sl  = 0.0;
         if(InpSlAtrMult > 0.0)
           {
            double atrEntry = AtrAtShift1();
            if(atrEntry > 0.0)
              {
               double dist = atrEntry * InpSlAtrMult;
               sl = NormalizeDouble(bid + dist, dg);
               double pt = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
               long   lvl = (long)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
               if(lvl > 0 && (sl - bid) < (double)lvl * pt)
                  sl = NormalizeDouble(bid + (double)lvl * pt, dg);
               if(sl <= bid || sl <= 0.0)
                  sl = 0.0;
              }
           }
         double lotsSell = LotsForOrder(ORDER_TYPE_SELL, bid, sl);
         if(!trade.Sell(lotsSell, _Symbol, bid, sl, tp, InpTradeComment))
            Print("Sell failed: ", GetLastError(), " retcode ", trade.ResultRetcode());
        }
     }

   string hud = StringFormat("GK WEEKLY | Sig:%d TP:%d Score:%.2f%% | buySc:%d sellSc:%d",
                             g_weeklySignals, g_weeklyTpHits, tpScore, buyScore, sellScore);
   Comment(hud);
  }

//+------------------------------------------------------------------+
