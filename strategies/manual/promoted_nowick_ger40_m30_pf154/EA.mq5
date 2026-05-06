//+------------------------------------------------------------------+
//| EA.mq5 — No-wick retest GER40 M30 (promoted IS ~20.2% / PF~1.98)|
//| Port of strategy.py + spec (Berlin 09:30–18:00, tp_r 3.4, …).  |
//| Install: copy `mql5/Include/Risk.mqh` → MT5 MQL5/Include/,      |
//| copy this file → MQL5/Experts/. Compile in MetaEditor.          |
//+------------------------------------------------------------------+
#property copyright "TRADING / promoted_nowick_ger40_m30_pf154"
#property version   "1.01"
#property strict

#include <Trade/Trade.mqh>
#include <Risk.mqh>

input string            InpSymbol           = "";
input ENUM_TIMEFRAMES   InpTF               = PERIOD_M30;
input ulong             InpMagic            = 202504201;
input int               InpSlippagePoints   = 30;
input double            InpRiskPct         = 2.2;
input double            InpDailyKillPct    = 5.0;
input int               InpMaxSpreadPts    = 40;

input int    InpMaxWaitBars         = 48;
input bool   InpWickStrictZero      = true;
input double InpWickEpsMult         = 0.55;
input double InpWickAtolMult        = 1e-9;
input int    InpTrendFast           = 50;
input int    InpTrendSlow           = 200;
input bool   InpTrendUseH1          = true;
input double InpTpRMult             = 3.4;
input double InpSlBufferPoints      = 2.5;
input double InpSlBufferAtrMult     = 0.0;
input double InpMinPullbackAtrMult  = 0.35;
input int    InpAtrPeriod           = 14;
input bool   InpConfirmCloseBeyond  = false;
input bool   InpVolFilterOn         = true;
input double InpAtrPercLo           = 5.0;
input double InpAtrPercHi           = 92.0;
input int    InpAtrPercLookback    = 500;
input int    InpMaxTradesPerDay     = 6;
input int    InpCooldownLossBars    = 4;
input bool   InpBlockHour0          = true;
input bool   InpBlockHour1          = true;
input bool   InpBlockHour6          = true;
input int    InpTimeStopBars        = 130;
input bool   InpBreakEvenOn         = true;
input double InpBeTrigR             = 0.35;
input double InpBeMfeR              = 0.28;
input double InpPointSizeModel      = 0.1;
input int    InpServerToBerlinMin   = 0;
input int    InpSessionStartMin     = 9 * 60 + 30;
input int    InpSessionEndMin       = 18 * 60;

CTrade          g_trade;
FactoryKillState g_kill;

int     g_hATR   = INVALID_HANDLE;
int     g_hEf    = INVALID_HANDLE;
int     g_hEs    = INVALID_HANDLE;
int     g_hEfH1  = INVALID_HANDLE;
int     g_hEsH1  = INVALID_HANDLE;

datetime g_lastBarTime = 0;
int      g_tradesToday = 0;
datetime g_tradeDay    = 0;
int      g_coolUntilBar = -1;
int      g_barCounter   = 0;
double   g_runHigh      = 0.0;
double   g_runLow       = 0.0;

string Sym() { return(InpSymbol == "" ? _Symbol : InpSymbol); }

ENUM_ORDER_TYPE_FILLING FillingMode()
  {
   int fm = (int)SymbolInfoInteger(Sym(), SYMBOL_FILLING_MODE);
   if((fm & SYMBOL_FILLING_FOK) == SYMBOL_FILLING_FOK) return(ORDER_FILLING_FOK);
   if((fm & SYMBOL_FILLING_IOC) == SYMBOL_FILLING_IOC) return(ORDER_FILLING_IOC);
   return(ORDER_FILLING_RETURN);
  }

//------------------------------------------------------------------
double WickTol(const double pt)
  {
   double t = SymbolInfoDouble(Sym(), SYMBOL_POINT);
   return(MathMax(t * InpWickAtolMult, 1e-15));
  }

bool WickBull(const MqlRates &r, const double pt)
  {
   if(InpWickStrictZero)
      return(MathAbs(r.open - r.low) <= WickTol(pt) && r.close > r.open);
   return(MathAbs(r.open - r.low) <= pt * InpWickEpsMult && r.close > r.open);
  }

bool WickBear(const MqlRates &r, const double pt)
  {
   if(InpWickStrictZero)
      return(MathAbs(r.open - r.high) <= WickTol(pt) && r.close < r.open);
   return(MathAbs(r.open - r.high) <= pt * InpWickEpsMult && r.close < r.open);
  }

double AtrAt(const int sh)
  {
   double b[];
   if(g_hATR == INVALID_HANDLE || CopyBuffer(g_hATR, 0, sh, 1, b) < 1) return(0.0);
   return(b[0]);
  }

double AtrPercentile(const int sh, const int totalBars)
  {
   double a0 = AtrAt(sh);
   if(a0 <= 0.0) return(0.0);
   int last = MathMin(sh + InpAtrPercLookback, totalBars - 1);
   int cnt = 0, n = 0;
   for(int i = sh; i <= last; i++)
     {
      double a = AtrAt(i);
      if(a <= 0.0) continue;
      n++;
      if(a <= a0) cnt++;
     }
   if(n < 5) return(50.0);
   return(100.0 * (double)cnt / (double)n);
  }

bool TrendM30(const int sh, const bool wantLong)
  {
   double bf[], bs[];
   if(CopyBuffer(g_hEf, 0, sh, 1, bf) < 1 || CopyBuffer(g_hEs, 0, sh, 1, bs) < 1) return(false);
   double cls[];
   if(CopyClose(Sym(), InpTF, sh, 1, cls) < 1) return(false);
   if(wantLong) return(bf[0] > bs[0] && cls[0] > bs[0]);
   return(bf[0] < bs[0] && cls[0] < bs[0]);
  }

bool TrendH1AtTime(const datetime tbar, const bool wantLong)
  {
   int sh1 = iBarShift(Sym(), PERIOD_H1, tbar, false);
   if(sh1 < 0) return(false);
   double bf[], bs[];
   if(CopyBuffer(g_hEfH1, 0, sh1, 1, bf) < 1 || CopyBuffer(g_hEsH1, 0, sh1, 1, bs) < 1) return(false);
   double cls[];
   if(CopyClose(Sym(), PERIOD_H1, sh1, 1, cls) < 1) return(false);
   if(wantLong) return(bf[0] > bs[0] && cls[0] > bs[0]);
   return(bf[0] < bs[0] && cls[0] < bs[0]);
  }

void BerlinHM(const datetime t, int &h, int &m)
  {
   MqlDateTime st;
   datetime adj = t + InpServerToBerlinMin * 60;
   TimeToStruct(adj, st);
   h = st.hour;
   m = st.min;
  }

bool SessionLocalOK(const datetime t)
  {
   int h, mi;
   BerlinHM(t, h, mi);
   int mins = h * 60 + mi;
   return(mins >= InpSessionStartMin && mins < InpSessionEndMin);
  }

bool BlockedHour(const datetime t)
  {
   int h, mi;
   BerlinHM(t, h, mi);
   if(InpBlockHour0 && h == 0) return(true);
   if(InpBlockHour1 && h == 1) return(true);
   if(InpBlockHour6 && h == 6) return(true);
   return(false);
  }

bool FindOurTicket(ulong &ticket)
  {
   ticket = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(!PositionSelectByTicket(tk)) continue;
      if(PositionGetString(POSITION_SYMBOL) != Sym()) continue;
      if((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      ticket = tk;
      return(true);
     }
   return(false);
  }

bool HasPosition() { ulong t; return(FindOurTicket(t)); }

bool PositionIsLong(ulong tk)
  {
   if(!PositionSelectByTicket(tk)) return(false);
   return(PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY);
  }

//------------------------------------------------------------------
bool EvalLongEntry(const MqlRates &rt[], const int total, const int entrySh,
                   double &outLimit, double &outSL, double &outTP)
  {
   outLimit = outSL = outTP = 0.0;
   if(entrySh < 1 || entrySh + InpMaxWaitBars + 5 >= total) return(false);
   datetime tbar = rt[entrySh].time;
   if(!SessionLocalOK(tbar) || BlockedHour(tbar)) return(false);

   double pt = InpPointSizeModel > 0.0 ? InpPointSizeModel : SymbolInfoDouble(Sym(), SYMBOL_POINT);

   for(int age = 1; age <= InpMaxWaitBars; age++)
     {
      int sigSh = entrySh + age;
      if(sigSh >= total - 1) break;
      if(!WickBull(rt[sigSh], pt)) continue;
      double hi = rt[sigSh].high;
      double lo = rt[sigSh].low;
      if(hi <= lo) continue;
      double atr_i = AtrAt(sigSh);
      double thr = hi - InpMinPullbackAtrMult * atr_i;

      bool pulled = false;
      for(int k = sigSh - 1; k >= entrySh + 1; k--)
        {
         if(rt[k].low < thr) { pulled = true; break; }
        }
      if(!pulled) continue;

      bool touch = (rt[entrySh].low <= hi && rt[entrySh].high >= hi);
      if(InpConfirmCloseBeyond) touch = touch && (rt[entrySh].close >= hi);
      if(!touch) continue;

      if(InpVolFilterOn)
        {
         double ap = AtrPercentile(entrySh, total);
         if(ap < InpAtrPercLo || ap > InpAtrPercHi) continue;
        }

      bool tL = InpTrendUseH1 ? TrendH1AtTime(rt[entrySh].time, true) : TrendM30(entrySh, true);
      if(!tL) continue;

      double buf = InpSlBufferPoints * pt + (InpSlBufferAtrMult > 0.0 ? InpSlBufferAtrMult * atr_i : 0.0);
      double segLo = rt[sigSh].low;
      for(int u = sigSh - 1; u >= entrySh; u--)
         segLo = MathMin(segLo, rt[u].low);
      double slPx = segLo - buf;
      if(slPx >= hi - pt * 1e-6) continue;
      double oneR = hi - slPx;
      if(oneR <= pt * 1e-6) continue;

      outLimit = hi;
      outSL = slPx;
      outTP = hi + InpTpRMult * oneR;
      return(true);
     }
   return(false);
  }

bool EvalShortEntry(const MqlRates &rt[], const int total, const int entrySh,
                    double &outLimit, double &outSL, double &outTP)
  {
   outLimit = outSL = outTP = 0.0;
   if(entrySh < 1 || entrySh + InpMaxWaitBars + 5 >= total) return(false);
   datetime tbar = rt[entrySh].time;
   if(!SessionLocalOK(tbar) || BlockedHour(tbar)) return(false);

   double pt = InpPointSizeModel > 0.0 ? InpPointSizeModel : SymbolInfoDouble(Sym(), SYMBOL_POINT);

   for(int age = 1; age <= InpMaxWaitBars; age++)
     {
      int sigSh = entrySh + age;
      if(sigSh >= total - 1) break;
      if(!WickBear(rt[sigSh], pt)) continue;
      double hi = rt[sigSh].high;
      double lo = rt[sigSh].low;
      if(hi <= lo) continue;
      double atr_i = AtrAt(sigSh);
      double thr = lo + InpMinPullbackAtrMult * atr_i;

      bool pulled = false;
      for(int k = sigSh - 1; k >= entrySh + 1; k--)
        {
         if(rt[k].high > thr) { pulled = true; break; }
        }
      if(!pulled) continue;

      bool touch = (rt[entrySh].low <= lo && rt[entrySh].high >= lo);
      if(InpConfirmCloseBeyond) touch = touch && (rt[entrySh].close <= lo);
      if(!touch) continue;

      if(InpVolFilterOn)
        {
         double ap = AtrPercentile(entrySh, total);
         if(ap < InpAtrPercLo || ap > InpAtrPercHi) continue;
        }

      bool tS = InpTrendUseH1 ? TrendH1AtTime(rt[entrySh].time, false) : TrendM30(entrySh, false);
      if(!tS) continue;

      double buf = InpSlBufferPoints * pt + (InpSlBufferAtrMult > 0.0 ? InpSlBufferAtrMult * atr_i : 0.0);
      double segHi = rt[sigSh].high;
      for(int u = sigSh - 1; u >= entrySh; u--)
         segHi = MathMax(segHi, rt[u].high);
      double slPx = segHi + buf;
      if(slPx <= lo + pt * 1e-6) continue;
      double oneR = slPx - lo;
      if(oneR <= pt * 1e-6) continue;

      outLimit = lo;
      outSL = slPx;
      outTP = lo - InpTpRMult * oneR;
      return(true);
     }
   return(false);
  }

//------------------------------------------------------------------
void ManageOpen(const MqlRates &rt[])
  {
   ulong tk = 0;
   if(!FindOurTicket(tk)) return;
   if(!PositionSelectByTicket(tk)) return;

   datetime opent = (datetime)PositionGetInteger(POSITION_TIME);
   int shOpen = iBarShift(Sym(), InpTF, opent, false);
   if(shOpen < 0) shOpen = 0;
   if(shOpen >= InpTimeStopBars)
     {
      g_trade.PositionClose(tk);
      return;
     }

   double ep = PositionGetDouble(POSITION_PRICE_OPEN);
   double sl = PositionGetDouble(POSITION_SL);
   double tp = PositionGetDouble(POSITION_TP);
   bool isLong = PositionIsLong(tk);
   double pt = SymbolInfoDouble(Sym(), SYMBOL_POINT);
   double r = isLong ? (ep - sl) : (sl - ep);
   if(r <= 0.0) return;

   if(isLong) g_runHigh = MathMax(g_runHigh, rt[0].high);
   else g_runLow = MathMin(g_runLow, rt[0].low);

   if(InpBreakEvenOn)
     {
      double mfeR = isLong ? ((g_runHigh - ep) / r) : ((ep - g_runLow) / r);
      double cls = rt[0].close;
      bool hitC = isLong ? ((cls - ep) / r >= InpBeTrigR) : ((ep - cls) / r >= InpBeTrigR);
      bool hitM = (InpBeMfeR > 0.0 && mfeR >= InpBeMfeR);
      if(hitC || hitM)
        {
         if(isLong && sl < ep) g_trade.PositionModify(tk, ep, tp);
         if(!isLong && sl > ep) g_trade.PositionModify(tk, ep, tp);
        }
     }
  }

//------------------------------------------------------------------
int OnInit()
  {
   string s = Sym();
   g_hATR = iATR(s, InpTF, InpAtrPeriod);
   g_hEf = iMA(s, InpTF, InpTrendFast, 0, MODE_EMA, PRICE_CLOSE);
   g_hEs = iMA(s, InpTF, InpTrendSlow, 0, MODE_EMA, PRICE_CLOSE);
   g_hEfH1 = iMA(s, PERIOD_H1, InpTrendFast, 0, MODE_EMA, PRICE_CLOSE);
   g_hEsH1 = iMA(s, PERIOD_H1, InpTrendSlow, 0, MODE_EMA, PRICE_CLOSE);
   if(g_hATR == INVALID_HANDLE || g_hEf == INVALID_HANDLE || g_hEs == INVALID_HANDLE)
      return(INIT_FAILED);
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpSlippagePoints);
   g_trade.SetTypeFilling(FillingMode());
   RiskKillReset(g_kill);
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   if(g_hATR != INVALID_HANDLE) IndicatorRelease(g_hATR);
   if(g_hEf != INVALID_HANDLE) IndicatorRelease(g_hEf);
   if(g_hEs != INVALID_HANDLE) IndicatorRelease(g_hEs);
   if(g_hEfH1 != INVALID_HANDLE) IndicatorRelease(g_hEfH1);
   if(g_hEsH1 != INVALID_HANDLE) IndicatorRelease(g_hEsH1);
  }

//------------------------------------------------------------------
void OnTick()
  {
   MqlRates rt[];
   ArraySetAsSeries(rt, true);
   int n = CopyRates(Sym(), InpTF, 0, 20000, rt);
   if(n < InpMaxWaitBars + InpTrendSlow + 200) return;

   if(!RiskDailyKillOK(g_kill, InpDailyKillPct)) return;
   if(!RiskSpreadOK(Sym(), (double)InpMaxSpreadPts)) return;

   bool newBar = (rt[0].time != g_lastBarTime);
   if(newBar)
     {
      g_lastBarTime = rt[0].time;
      g_barCounter++;
      datetime day0 = StringToTime(TimeToString(rt[1].time, TIME_DATE));
      if(day0 != g_tradeDay)
        {
         g_tradeDay = day0;
         g_tradesToday = 0;
        }

      if(g_barCounter >= g_coolUntilBar && !HasPosition())
        {
         if(InpMaxTradesPerDay == 0 || g_tradesToday < InpMaxTradesPerDay)
           {
            double lmt, slv, tpv;
            if(EvalLongEntry(rt, n, 1, lmt, slv, tpv))
              {
               double pt = SymbolInfoDouble(Sym(), SYMBOL_POINT);
               double slPts = MathAbs(lmt - slv) / pt;
               double lots = RiskLotsByPct(Sym(), InpRiskPct, slPts);
               if(lots > 0.0 && g_trade.BuyLimit(lots, lmt, Sym(), slv, tpv, ORDER_TIME_GTC, 0, "NW-L"))
                  g_tradesToday++;
              }
            else
              {
               double l2, s2, t2;
               if(EvalShortEntry(rt, n, 1, l2, s2, t2))
                 {
                  double pt = SymbolInfoDouble(Sym(), SYMBOL_POINT);
                  double slPts = MathAbs(s2 - l2) / pt;
                  double lots = RiskLotsByPct(Sym(), InpRiskPct, slPts);
                  if(lots > 0.0 && g_trade.SellLimit(lots, l2, Sym(), s2, t2, ORDER_TIME_GTC, 0, "NW-S"))
                     g_tradesToday++;
                 }
              }
           }
        }
     }

   if(HasPosition())
      ManageOpen(rt);
  }

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &req,
                        const MqlTradeResult &res)
  {
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
   if(!HistoryDealSelect(trans.deal)) return;
   if(HistoryDealGetString(trans.deal, DEAL_SYMBOL) != Sym()) return;
   if((ulong)HistoryDealGetInteger(trans.deal, DEAL_MAGIC) != InpMagic) return;

   ENUM_DEAL_ENTRY dty = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
   if(dty == DEAL_ENTRY_IN)
     {
      g_runHigh = iHigh(Sym(), InpTF, 0);
      g_runLow = iLow(Sym(), InpTF, 0);
     }
   if(dty == DEAL_ENTRY_OUT)
     {
      double pl = HistoryDealGetDouble(trans.deal, DEAL_PROFIT) + HistoryDealGetDouble(trans.deal, DEAL_SWAP) + HistoryDealGetDouble(trans.deal, DEAL_COMMISSION);
      if(pl < 0.0 && InpCooldownLossBars > 0)
         g_coolUntilBar = g_barCounter + InpCooldownLossBars;
     }
  }
