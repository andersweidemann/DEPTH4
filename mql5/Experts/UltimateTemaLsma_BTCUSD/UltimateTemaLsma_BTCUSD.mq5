//+------------------------------------------------------------------+
//|                                  UltimateTemaLsma_BTCUSD.mq5    |
//| Port of ULTIMATE TEMA/LSMA + IDEAL + REVERSAL + INSTITUTIONAL + |
//| DAVIN MA [DYNAMIC] — attach to BTCUSD PERIOD_H1 (input default).|
//|                                                                  |
//| Known differences vs TradingView / Pine:                         |
//| • v1.03: institutional OFF + entryOrder=SKIP_INST by default —   |
//|   full Python stack was masking IDEAL/ORIG; enable inst + PINE    |
//|   order only when matching the offline replica.                  |
//| • Pivots: ta.pivothigh/low replica (Python _pivothigh/_pivotlow)   |
//| • VWAP: UTC day VWAP vs TV session VWAP                           |
//| • Exits: SL/TP set at broker; trailing checked on new bar only   |
//| • Handles: indicators recreated often (fine for H1); optional   |
//|   refactor to IndicatorRelease-once handles in OnInit           |
//+------------------------------------------------------------------+
#property copyright "TRADING workspace port"
#property version   "1.03"
#property strict

#include <Trade/Trade.mqh>

// Who wins when several lanes fire on the same bar (Python replica uses PINE order).
enum ENUM_UTL_ENTRY_ORDER
  {
   UTL_ORDER_PINE = 0,        // INST → IDEAL → REV → DAVIN → ORIG
   UTL_ORDER_IDEAL_FIRST = 1, // IDEAL → REV → DAVIN → INST → ORIG (useful vs TradingView screenshots)
   UTL_ORDER_SKIP_INST = 2    // IDEAL → REV → DAVIN → ORIG — institutional lane ignored even if enabled
  };

input string            InpSymbol           = "";
input ENUM_TIMEFRAMES   InpTF               = PERIOD_H1;
input ulong             InpMagic            = 90901101;
// Deviation in points (SYMBOL_POINT). Crypto: 100×point can be huge — match broker tick/point before tightening.
input int               InpSlippagePoints   = 50;
input double            InpRiskDailyKillPct  = 5.0;
input bool              InpOnlyOnePosition  = true;

input int    InpTemaLen           = 9;
input int    InpLsmaLen           = 25;
input int    InpEma100Len         = 100;
input int    InpAtrLen            = 14;
input double InpTpAtrMult         = 3.0;
input double InpSlAtrMult         = 1.5;
input double InpTrailAtrMult      = 1.0;
input int    InpMaxBarsInTrade    = 25;
input int    InpVolMaLen          = 20;
input double InpVolMult           = 1.2;

input bool   InpUseTrendExhaust   = true;
input int    InpMinTrendBars      = 10;
input bool   InpMomentumDiv       = true;
input bool   InpRequireTrendAlign = true;
input double InpTrendStrengthThr  = 0.5;

input bool   InpUseIdeal          = true;
input int    InpAdaptivePivotLb   = 10;
input double InpMinSweepAtr       = 0.5;
input double InpRetestTol         = 0.005;
input int    InpMaxTestCount      = 3;
input double InpAtrTestPct        = 0.5;

input ENUM_UTL_ENTRY_ORDER InpEntryOrder = UTL_ORDER_SKIP_INST;
input bool   InpJournalEntries    = false;

input bool   InpEnableReversals   = true;
input int    InpKamaLen           = 10;
input int    InpAdxLen            = 14;
input double InpAdxStrong         = 20.0;
input int    InpRsiLenRev         = 14;
input double InpVolMultRev        = 1.0;

// Off by default: ACCUM/DIST zones often fire every bar on CFD BTC and hide IDEAL/ORIG (looks “same” after code fixes).
input bool   InpUseInstitutional  = false;
input int    InpInstSwingLb       = 20;
input double InpInstZoneAtr       = 0.5;
input double InpInstMidAtrBuf     = 0.25;
input double InpInstBasePct       = 10.0;
input bool   InpInstScale         = true;
input bool   InpUseVwapMid        = true;

input bool   InpUseDavin          = true;
input int    InpDavinMaLong       = 200;
input int    InpDavinMaShort      = 10;
input bool   InpDavinBuyDip       = true;
input double InpDavinDipTrig      = 14.0;
input bool   InpDavinLowerClose   = true;

input double InpPctInst           = 10.0;
input double InpPctIdeal          = 15.0;
input double InpPctRev            = 12.5;
input double InpPctOther          = 10.0;
// 0 = use SYMBOL_TRADE_CONTRACT_SIZE for %-of-equity sizing (same intent as Pine qty = equity/c*pct/100).
input double InpContractSizeOverride = 0.0;
// More bars → TEMA/LSMA closer to TradingView (TV uses full history). Min ~400.
input int    InpHistoryBars       = 2000;

#define SIG_SHIFT 1

//------------------------------------------------------------------
// MQL5 indicators return handles; shift goes to CopyBuffer, not iMA/iATR/...
double IndCopy0(const int handle, const int shift)
  {
   if(handle == INVALID_HANDLE) return(EMPTY_VALUE);
   double b[];
   ArraySetAsSeries(b, true);
   if(CopyBuffer(handle, 0, shift, 1, b) != 1)
     {
      IndicatorRelease(handle);
      return(EMPTY_VALUE);
     }
   IndicatorRelease(handle);
   return(b[0]);
  }

double GetATR(const string s, const ENUM_TIMEFRAMES tf, const int period, const int shift)
  {
   int h = iATR(s, tf, period);
   return(IndCopy0(h, shift));
  }

double GetMA(const string s, const ENUM_TIMEFRAMES tf, const int period,
             const ENUM_MA_METHOD method, const int shift)
  {
   int h = iMA(s, tf, period, 0, method, PRICE_CLOSE);
   return(IndCopy0(h, shift));
  }

double GetWPR(const string s, const ENUM_TIMEFRAMES tf, const int period, const int shift)
  {
   int h = iWPR(s, tf, period);
   return(IndCopy0(h, shift));
  }

double GetCCI(const string s, const ENUM_TIMEFRAMES tf, const int period,
              const ENUM_APPLIED_PRICE ap, const int shift)
  {
   int h = iCCI(s, tf, period, ap);
   return(IndCopy0(h, shift));
  }

double GetRSI(const string s, const ENUM_TIMEFRAMES tf, const int period, const int shift)
  {
   int h = iRSI(s, tf, period, PRICE_CLOSE);
   return(IndCopy0(h, shift));
  }

// Pine: stochK = sma( ta.stoch(close,high,low,9), 6 ), stochD = sma(stochK, 3)
bool PineStochKD(const double &hi[], const double &lo[], const double &cl[], const int n,
                 const int idx, double &kSm, double &dSm)
  {
   if(idx < 15) return(false);
   double rk[];
   ArrayResize(rk, n);
   ArrayInitialize(rk, 0.0);
   for(int ix = 8; ix < n; ix++)
     {
      double hh = hi[ix];
      double ll = lo[ix];
      for(int t = ix - 8; t <= ix; t++)
        {
         if(hi[t] > hh) hh = hi[t];
         if(lo[t] < ll) ll = lo[t];
        }
      rk[ix] = (hh == ll) ? 0.0 : (100.0 * (cl[ix] - ll) / (hh - ll));
     }
   double ks[];
   ArrayResize(ks, n);
   ArrayInitialize(ks, EMPTY_VALUE);
   for(int ix = 13; ix < n; ix++)
     {
      double s = 0.0;
      for(int j = 0; j < 6; j++)
         s += rk[ix - j];
      ks[ix] = s / 6.0;
     }
   if(ks[idx] == EMPTY_VALUE || ks[idx - 1] == EMPTY_VALUE || ks[idx - 2] == EMPTY_VALUE)
      return(false);
   kSm = ks[idx];
   dSm = (ks[idx] + ks[idx - 1] + ks[idx - 2]) / 3.0;
   return(true);
  }

// Pine stochRSI uses RSI(14) rolling min/max over 14 bars — match TV closer than manual loop
bool PineStochRsi(const double &symRsi14[], const int n, const int idx, double &out)
  {
   if(idx < 13 || idx >= n) return(false);
   double rmin = 1e100, rmax = -1e100;
   for(int j = 0; j < 14; j++)
     {
      double rv = symRsi14[idx - j];
      if(rv == EMPTY_VALUE) return(false);
      if(rv < rmin) rmin = rv;
      if(rv > rmax) rmax = rv;
     }
   double rsi1 = symRsi14[idx];
   out = (rmax == rmin) ? 50.0 : (rsi1 - rmin) / (rmax - rmin) * 100.0;
   return(true);
  }

//------------------------------------------------------------------
CTrade      Trade;
string      g_sym;
ENUM_TIMEFRAMES g_tf;

double   g_lastPivotHigh = EMPTY_VALUE;
double   g_lastPivotLow  = EMPTY_VALUE;
double   g_lastBullBoS   = EMPTY_VALUE;
double   g_lastBearBoS   = EMPTY_VALUE;
int      g_ema100TestCnt = 0;
double   g_lastTestPrice = EMPTY_VALUE;
datetime g_lastTestBar   = 0;

int      g_trendBars = 0;
bool     g_trendBull = false;
double   g_trendStartPx = 0.0;

double   g_runTrailPeak = 0.0;
double   g_runTrailLo   = EMPTY_VALUE;

enum SigSource { SRC_NONE=0, SRC_INST, SRC_IDEAL, SRC_REV, SRC_DAVIN, SRC_ORIG };
SigSource g_entrySig = SRC_NONE;

datetime g_lastBarTime = 0;

//------------------------------------------------------------------
// CopyClose: index 0 = oldest, last = newest (current bar).
int IdxShift(const int n, const int sh) { return(n - 1 - sh); }

bool CalcTEMA(const double &cl[], const int n, const int len, const int idx, double &out)
  {
   if(idx < 1 || idx >= n) return(false);
   double a = 2.0 / ((double)len + 1.0);
   double e1[], e2[], e3[];
   ArrayResize(e1, n);
   ArrayResize(e2, n);
   ArrayResize(e3, n);
   e1[0] = cl[0];
   for(int i = 1; i < n; i++)
      e1[i] = a * cl[i] + (1.0 - a) * e1[i - 1];
   e2[0] = e1[0];
   for(int i = 1; i < n; i++)
      e2[i] = a * e1[i] + (1.0 - a) * e2[i - 1];
   e3[0] = e2[0];
   for(int i = 1; i < n; i++)
      e3[i] = a * e2[i] + (1.0 - a) * e3[i - 1];
   out = 3.0 * e1[idx] - 3.0 * e2[idx] + e3[idx];
   return(true);
  }

bool LinRegEnd(const double &y[], const int L, const int idx, double &out)
  {
   if(idx < L - 1) return(false);
   double sx = 0, sy = 0, sxx = 0, sxy = 0;
   for(int i = 0; i < L; i++)
     {
      double x = (double)i;
      double yi = y[idx - (L - 1) + i];
      sx += x;
      sy += yi;
      sxx += x * x;
      sxy += x * yi;
     }
   double nn = (double)L;
   double den = nn * sxx - sx * sx;
   if(den == 0.0) return(false);
   double slope = (nn * sxy - sx * sy) / den;
   double intercept = (sy - slope * sx) / nn;
   out = slope * (L - 1.0) + intercept;
   return(true);
  }

double VwapDayFromIdx(const datetime &tm[], const double &hi[], const double &lo[],
                      const double &cl[], const long &vol[], const int n, const int idx)
  {
   if(idx < 0 || idx >= n) return(EMPTY_VALUE);
   MqlDateTime dt;
   TimeToStruct(tm[idx], dt);
   double cumPV = 0.0, cumV = 0.0;
   for(int i = idx; i >= 0; i--)
     {
      MqlDateTime di;
      TimeToStruct(tm[i], di);
      if(di.day != dt.day || di.mon != dt.mon || di.year != dt.year)
         break;
      double tp = (hi[i] + lo[i] + cl[i]) / 3.0;
      double vv = (double)vol[i];
      if(vv <= 0) vv = 1.0;
      cumPV += tp * vv;
      cumV += vv;
     }
   if(cumV <= 0) return(EMPTY_VALUE);
   return(cumPV / cumV);
  }

// Same logic as research/ultimate_tema_lsma_bt.py:_pivothigh / _pivotlow (TradingView ta.pivot*)
bool PivotHighAtConfirm(const double &high[], const int n, const int confIdx,
                        const int left, const int right, double &outLevel)
  {
   if(confIdx < left + right || confIdx >= n) return(false);
   const int center = confIdx - right;
   if(center - left < 0 || center + right >= n) return(false);

   double maxWin = high[center - left];
   for(int k = center - left + 1; k <= center + right; k++)
      if(high[k] > maxWin) maxWin = high[k];

   double maxOthers = -1.0e100;
   for(int k = center - left; k <= center + right; k++)
     {
      if(k == center) continue;
      if(high[k] > maxOthers) maxOthers = high[k];
     }

   const double eps = 1e-10;
   if(high[center] + eps < maxWin) return(false);
   if(high[center] <= maxOthers + eps) return(false);
   outLevel = high[center];
   return(true);
  }

bool PivotLowAtConfirm(const double &low[], const int n, const int confIdx,
                       const int left, const int right, double &outLevel)
  {
   if(confIdx < left + right || confIdx >= n) return(false);
   const int center = confIdx - right;
   if(center - left < 0 || center + right >= n) return(false);

   double minWin = low[center - left];
   for(int k = center - left + 1; k <= center + right; k++)
      if(low[k] < minWin) minWin = low[k];

   double minOthers = 1.0e100;
   for(int k = center - left; k <= center + right; k++)
     {
      if(k == center) continue;
      if(low[k] < minOthers) minOthers = low[k];
     }

   const double eps = 1e-10;
   if(low[center] - eps > minWin) return(false);
   if(low[center] >= minOthers - eps) return(false);
   outLevel = low[center];
   return(true);
  }

// Python: sequential scan — last non-na ph[i]/pl[i] up to bar uptoIdx (same memory as Pine).
void PineRebuildLastPivots(const double &high[], const double &low[], const int n,
                           const int uptoIdx, const int left, const int right)
  {
   g_lastPivotHigh = EMPTY_VALUE;
   g_lastPivotLow = EMPTY_VALUE;
   const int minConf = left + right;
   if(uptoIdx < minConf || minConf < 2) return;

   double lastPH = EMPTY_VALUE;
   double lastPL = EMPTY_VALUE;
   for(int confIdx = minConf; confIdx <= uptoIdx; confIdx++)
     {
      double pv;
      if(PivotHighAtConfirm(high, n, confIdx, left, right, pv))
         lastPH = pv;
      if(PivotLowAtConfirm(low, n, confIdx, left, right, pv))
         lastPL = pv;
     }
   g_lastPivotHigh = lastPH;
   g_lastPivotLow = lastPL;
  }

double NormalizeVol(double lots)
  {
   double step = SymbolInfoDouble(g_sym, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(g_sym, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(g_sym, SYMBOL_VOLUME_MAX);
   if(step <= 0) step = 0.01;
   lots = MathFloor(lots / step) * step;
   if(lots < vmin) lots = vmin;
   if(lots > vmax) lots = vmax;
   return(NormalizeDouble(lots, 2));
  }

double LotsFromPct(const double pct)
  {
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   double price = SymbolInfoDouble(g_sym, SYMBOL_ASK);
   if(price <= 0) price = SymbolInfoDouble(g_sym, SYMBOL_LAST);
   double cs = (InpContractSizeOverride > 0.0) ? InpContractSizeOverride : SymbolInfoDouble(g_sym, SYMBOL_TRADE_CONTRACT_SIZE);
   if(cs <= 0.0) cs = 1.0;
   // Mirror Python: qty = equity * pct/100 / close  →  lots = qty / contract_units_per_lot
   double notional = eq * (pct / 100.0);
   double lots = notional / (price * cs);
   return(NormalizeVol(lots));
  }

// Pull SL/TP to minimum broker distance — otherwise OrderSend fails and the graph stays wrong with no visible error.
bool ClampStopsForMarket(const bool isBuy, double &sl, double &tp)
  {
   double bid = SymbolInfoDouble(g_sym, SYMBOL_BID);
   double ask = SymbolInfoDouble(g_sym, SYMBOL_ASK);
   double point = SymbolInfoDouble(g_sym, SYMBOL_POINT);
   if(point <= 0.0)
      point = 0.00001;
   const int dg = (int)SymbolInfoInteger(g_sym, SYMBOL_DIGITS);
   const int stopsPts = (int)SymbolInfoInteger(g_sym, SYMBOL_TRADE_STOPS_LEVEL);
   const int freezePts = (int)SymbolInfoInteger(g_sym, SYMBOL_TRADE_FREEZE_LEVEL);
   const double minDist = (double)(stopsPts + freezePts) * point + point;
   const double ref = isBuy ? ask : bid;

   if(isBuy)
     {
      if(ref - sl < minDist)
         sl = NormalizeDouble(ref - minDist, dg);
      if(tp - ref < minDist)
         tp = NormalizeDouble(ref + minDist, dg);
      return(sl < ref && tp > ref && sl > 0 && tp > 0);
     }
   else
     {
      if(sl - ref < minDist)
         sl = NormalizeDouble(ref + minDist, dg);
      if(ref - tp < minDist)
         tp = NormalizeDouble(ref - minDist, dg);
      return(sl > ref && tp < ref && sl > 0 && tp > 0);
     }
  }

bool NewH1Bar()
  {
   datetime t = iTime(g_sym, g_tf, 0);
   if(t == g_lastBarTime) return(false);
   g_lastBarTime = t;
   return(true);
  }

bool HasPos(const int dir)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != g_sym) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      long ty = PositionGetInteger(POSITION_TYPE);
      if(dir == 0) return(true);
      if(dir == 1 && ty == POSITION_TYPE_BUY) return(true);
      if(dir == -1 && ty == POSITION_TYPE_SELL) return(true);
     }
   return(false);
  }

bool ClosePos()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != g_sym) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      Trade.PositionClose(ticket);
      return(true);
     }
   return(false);
  }

double PosEntry()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != g_sym) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      return(PositionGetDouble(POSITION_PRICE_OPEN));
     }
   return(0.0);
  }

int BarsSinceEntry()
  {
   datetime op = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != g_sym) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      op = (datetime)PositionGetInteger(POSITION_TIME);
      break;
     }
   if(op == 0) return(0);
   int sh = iBarShift(g_sym, g_tf, op, false);
   if(sh < 0) return(999999);
   return(sh);
  }

//------------------------------------------------------------------
int OnInit()
  {
   g_sym = (StringLen(InpSymbol) == 0) ? _Symbol : InpSymbol;
   g_tf  = InpTF;
   Trade.SetExpertMagicNumber(InpMagic);
   Trade.SetDeviationInPoints(InpSlippagePoints);
   long fill = (long)SymbolInfoInteger(g_sym, SYMBOL_FILLING_MODE);
   if((fill & SYMBOL_FILLING_IOC) == SYMBOL_FILLING_IOC)
      Trade.SetTypeFilling(ORDER_FILLING_IOC);
   else if((fill & SYMBOL_FILLING_FOK) == SYMBOL_FILLING_FOK)
      Trade.SetTypeFilling(ORDER_FILLING_FOK);
   else
      Trade.SetTypeFilling(ORDER_FILLING_RETURN);
   Print("UltimateTemaLsma_BTCUSD init: ", g_sym, " ", EnumToString(g_tf),
         " history=", InpHistoryBars, " pivots L=", InpAdaptivePivotLb,
         " entryOrder=", (int)InpEntryOrder, " inst=", InpUseInstitutional,
         " — if PF bad & trades never change, see InpUseInstitutional/InpEntryOrder inputs");
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason) {}

//------------------------------------------------------------------
void OnTick()
  {
   if(!NewH1Bar()) return;
   int NB = InpHistoryBars;
   if(NB < 400)
      NB = 400;
   if(NB > 20000)
      NB = 20000;
   if(Bars(g_sym, g_tf) < NB) return;

   double o[], h[], l[], c[];
   long   v[];
   datetime bt[];
   ArrayResize(o, NB);
   ArrayResize(h, NB);
   ArrayResize(l, NB);
   ArrayResize(c, NB);
   ArrayResize(v, NB);
   ArrayResize(bt, NB);
   if(CopyOpen(g_sym, g_tf, 0, NB, o) < NB) return;
   if(CopyHigh(g_sym, g_tf, 0, NB, h) < NB) return;
   if(CopyLow(g_sym, g_tf, 0, NB, l) < NB) return;
   if(CopyClose(g_sym, g_tf, 0, NB, c) < NB) return;
   if(CopyTickVolume(g_sym, g_tf, 0, NB, v) < NB) return;
   if(CopyTime(g_sym, g_tf, 0, NB, bt) < NB) return;

   const int si = IdxShift(NB, SIG_SHIFT);

   PineRebuildLastPivots(h, l, NB, si, InpAdaptivePivotLb, InpAdaptivePivotLb);

   double O = o[si], Hi = h[si], Lo = l[si], Cl = c[si];
   long V = v[si];

   // Wilder RSI(14) per bar index (matches TradingView ta.rsi) — shift = bars back from current
   double rsi14hist[];
   ArrayResize(rsi14hist, NB);
   ArrayInitialize(rsi14hist, EMPTY_VALUE);
   for(int ix = 14; ix < NB; ix++)
     {
      int shBar = NB - 1 - ix;
      rsi14hist[ix] = GetRSI(g_sym, g_tf, 14, shBar);
     }

   double atr = GetATR(g_sym, g_tf, InpAtrLen, SIG_SHIFT);
   if(atr <= 0 || atr == EMPTY_VALUE) return;

   double ema100 = GetMA(g_sym, g_tf, InpEma100Len, MODE_EMA, SIG_SHIFT);

   double tema = 0.0, temaP = 0.0, lsma = 0.0, lsmaP = 0.0;
   if(!CalcTEMA(c, NB, InpTemaLen, si, tema)) return;
   if(!CalcTEMA(c, NB, InpTemaLen, si - 1, temaP)) return;
   if(!LinRegEnd(c, InpLsmaLen, si, lsma)) return;
   if(!LinRegEnd(c, InpLsmaLen, si - 1, lsmaP)) return;

   double rsi14 = rsi14hist[si];
   if(rsi14 == EMPTY_VALUE) return;

   double volMa = 0.0;
   for(int j = 0; j < InpVolMaLen; j++)
      volMa += (double)v[si - j];
   volMa /= InpVolMaLen;

   double vwap = VwapDayFromIdx(bt, h, l, c, v, NB, si);

   double davin1 = GetMA(g_sym, g_tf, InpDavinMaLong, MODE_SMA, SIG_SHIFT);
   double davin2 = GetMA(g_sym, g_tf, InpDavinMaShort, MODE_SMA, SIG_SHIFT);
   int ixHigh52 = iHighest(g_sym, g_tf, MODE_HIGH, 52, SIG_SHIFT);
   double hh52b = (ixHigh52 >= 0) ? iHigh(g_sym, g_tf, ixHigh52) : Cl;
   double davinOv = (hh52b > 0) ? ((hh52b - Cl) / hh52b * 100.0) : 0.0;

   int ixSwingH = iHighest(g_sym, g_tf, MODE_HIGH, InpInstSwingLb, SIG_SHIFT);
   int ixSwingL = iLowest(g_sym, g_tf, MODE_LOW, InpInstSwingLb, SIG_SHIFT);
   double dynHi = (ixSwingH >= 0) ? iHigh(g_sym, g_tf, ixSwingH) : Hi;
   double dynLo = (ixSwingL >= 0) ? iLow(g_sym, g_tf, ixSwingL) : Lo;
   double dynBuyLo = dynLo;
   double dynBuyHi = dynLo + atr * InpInstZoneAtr;
   double dynSellHi = dynHi;
   double dynSellLo = dynHi - atr * InpInstZoneAtr;
   double dynMid = InpUseVwapMid ? vwap : (dynHi + dynLo) / 2.0;
   double dynMidLo = dynMid - atr * InpInstMidAtrBuf;
   double dynMidHi = dynMid + atr * InpInstMidAtrBuf;
   double dynRangeW = atr * InpInstZoneAtr;

   double rsiRev = GetRSI(g_sym, g_tf, InpRsiLenRev, SIG_SHIFT);

   double stochK = 0.0, stochD = 0.0;
   if(!PineStochKD(h, l, c, NB, si, stochK, stochD))
     {
      stochK = 50.0;
      stochD = 50.0;
     }

   double stochRsi = 50.0;
   if(!PineStochRsi(rsi14hist, NB, si, stochRsi))
      stochRsi = 50.0;

   double macdMain[], macdSig[];
   ArrayResize(macdMain, 2);
   ArrayResize(macdSig, 2);
   int mh = iMACD(g_sym, g_tf, 12, 26, 9, PRICE_CLOSE);
   if(mh == INVALID_HANDLE) return;
   if(CopyBuffer(mh, 0, SIG_SHIFT, 1, macdMain) < 1 || CopyBuffer(mh, 1, SIG_SHIFT, 1, macdSig) < 1)
     {
      IndicatorRelease(mh);
      return;
     }
   IndicatorRelease(mh);

   double adxArr[], pdi[], mdi[];
   ArrayResize(adxArr, 2);
   ArrayResize(pdi, 2);
   ArrayResize(mdi, 2);
   int ah = iADX(g_sym, g_tf, InpAdxLen);
   if(ah == INVALID_HANDLE) return;
   if(CopyBuffer(ah, 0, SIG_SHIFT, 1, adxArr) < 1 ||
      CopyBuffer(ah, 1, SIG_SHIFT, 1, pdi) < 1 ||
      CopyBuffer(ah, 2, SIG_SHIFT, 1, mdi) < 1)
     {
      IndicatorRelease(ah);
      return;
     }
   IndicatorRelease(ah);

   double will = GetWPR(g_sym, g_tf, 14, SIG_SHIFT);
   // Python replica uses CCI on close, not typical price
   double cci = GetCCI(g_sym, g_tf, 14, PRICE_CLOSE, SIG_SHIFT);

   double kamaRev = GetMA(g_sym, g_tf, InpKamaLen, MODE_EMA, SIG_SHIFT);
   double kamaPrev = GetMA(g_sym, g_tf, InpKamaLen, MODE_EMA, SIG_SHIFT + 1);
   bool kamaRise = kamaRev > kamaPrev;
   bool kamaFall = kamaRev < kamaPrev;

   double volMaRev = 0.0;
   for(int j = 0; j < InpVolMaLen; j++)
      volMaRev += (double)v[si - j];
   volMaRev /= InpVolMaLen;

   double ema100_s2 = GetMA(g_sym, g_tf, InpEma100Len, MODE_EMA, SIG_SHIFT + 1);
   bool bullBoS = (c[si - 1] < ema100_s2) && (Cl > ema100);
   bool bearBoS = (c[si - 1] > ema100_s2) && (Cl < ema100);
   if(bullBoS) g_lastBullBoS = ema100;
   if(bearBoS) g_lastBearBoS = ema100;

   bool bullBoSRetest = (g_lastBullBoS != EMPTY_VALUE) &&
                        Cl < g_lastBullBoS * (1.0 + InpRetestTol) &&
                        Cl > g_lastBullBoS * (1.0 - InpRetestTol) && Cl > O;

   bool bearBoSRetest = (g_lastBearBoS != EMPTY_VALUE) &&
                        Cl > g_lastBearBoS * (1.0 - InpRetestTol) &&
                        Cl < g_lastBearBoS * (1.0 + InpRetestTol) && Cl < O;

   if(MathAbs(Cl - ema100) < atr * InpAtrTestPct)
     {
      if(g_lastTestBar != bt[si] || g_lastTestPrice != Cl)
        {
         g_ema100TestCnt++;
         g_lastTestPrice = Cl;
         g_lastTestBar = bt[si];
        }
     }
   if(MathAbs(Cl - ema100) > atr * 0.5) g_ema100TestCnt = 0;

   bool lowerHigh = (g_lastPivotHigh != EMPTY_VALUE) && Hi < g_lastPivotHigh && Hi > h[si - 1];

   double zoneScore =
      ((Cl - tema) / tema * 100.0 + (Cl - lsma) / lsma * 100.0 + (Cl - ema100) / ema100 * 100.0) /
      3.0;
   double zt1 = 5.0, zt2 = 2.5;
   string zone = "NH";
   if(zoneScore <= -zt1) zone = "EO";
   else if(zoneScore <= -zt2) zone = "OS";
   else if(zoneScore <= 0.5) zone = "NL";
   else if(zoneScore <= 1.5) zone = "NH";
   else if(zoneScore <= zt2) zone = "OB";
   else zone = "EOB";

   bool isTemaBull = tema > temaP;
   bool isLsmaBull = lsma > lsmaP;
   double em100P = ema100_s2;
   bool isEmaBull = ema100 > em100P;
   bool allBull = isTemaBull && isLsmaBull && isEmaBull;
   bool allBear = !isTemaBull && !isLsmaBull && !isEmaBull;

   bool longAllowed = InpRequireTrendAlign ? allBull : (tema > lsma && Cl > ema100);
   bool shortAllowed = InpRequireTrendAlign ? allBear : (tema < lsma && Cl < ema100);

   double temaS5 = 0.0;
   CalcTEMA(c, NB, InpTemaLen, si - 5, temaS5);
   double lsmaS10 = 0.0;
   LinRegEnd(c, InpLsmaLen, si - 10, lsmaS10);
   double emaS20 = GetMA(g_sym, g_tf, InpEma100Len, MODE_EMA, SIG_SHIFT + 20);
   double normStr = MathAbs(((tema - temaS5) + (lsma - lsmaS10) + (ema100 - emaS20)) / 3.0) / atr;

   // Pine / Python order: update trend regime FIRST, then trend_exhausted (was reversed → wrong ORIG lane)
   if(allBull && (!g_trendBull || g_trendStartPx == 0.0))
     {
      g_trendBars = 1;
      g_trendBull = true;
      g_trendStartPx = Cl;
     }
   else if(allBear && (g_trendBull || g_trendStartPx == 0.0))
     {
      g_trendBars = 1;
      g_trendBull = false;
      g_trendStartPx = Cl;
     }
   else if((g_trendBull && allBull) || (!g_trendBull && allBear))
      g_trendBars++;
   else
     {
      g_trendBars = 0;
      g_trendBull = false;
      g_trendStartPx = 0.0;
     }

   bool trendExhausted = false;
   if(g_trendBars > 0 && g_trendStartPx > 0.0)
     {
      bool cond1 = g_trendBars > InpMinTrendBars * 2;
      bool cond2 = normStr < InpTrendStrengthThr;
      bool cond3 = (g_trendBull && !allBull) || (!g_trendBull && !allBear);
      bool rsiDiv = false;
      if(InpMomentumDiv)
        {
         double rsiOld = rsi14hist[si - 10];
         if(rsiOld != EMPTY_VALUE && rsi14 != EMPTY_VALUE)
           {
            if(g_trendBull) rsiDiv = Cl > c[si - 10] && rsi14 < rsiOld;
            else rsiDiv = Cl < c[si - 10] && rsi14 > rsiOld;
           }
        }
      trendExhausted = cond1 && (cond2 || cond3 || rsiDiv);
     }

   bool volOk = (double)V > volMa * InpVolMult;
   double temaPrev = 0.0, lsmaPrev = 0.0;
   CalcTEMA(c, NB, InpTemaLen, si - 1, temaPrev);
   LinRegEnd(c, InpLsmaLen, si - 1, lsmaPrev);
   bool temaXUp = (temaPrev <= lsmaPrev) && (tema > lsma);
   bool temaXDn = (temaPrev >= lsmaPrev) && (tema < lsma);

   bool stochBear = (stochK < 50.0) || (stochK < stochD);
   bool stochBull = (stochK > 50.0) || (stochK > stochD);
   int bearScore = (rsiRev < 50 ? 1 : 0) + (stochBear ? 1 : 0) + (stochRsi < 50 ? 1 : 0) +
                   (macdMain[0] < macdSig[0] ? 1 : 0) + (will < -50.0 ? 1 : 0) + (cci < 0 ? 1 : 0);
   int bullScore = (rsiRev > 50 ? 1 : 0) + (stochBull ? 1 : 0) + (stochRsi > 50 ? 1 : 0) +
                   (macdMain[0] > macdSig[0] ? 1 : 0) + (will > -50.0 ? 1 : 0) + (cci > 0 ? 1 : 0);

   bool longTrendRev = Cl > kamaRev && kamaRise && (adxArr[0] > InpAdxStrong || pdi[0] > mdi[0]);
   bool shortTrendRev = Cl < kamaRev && kamaFall && (adxArr[0] > InpAdxStrong || mdi[0] > pdi[0]);
   bool volOkRev = (double)V > volMaRev * InpVolMultRev;

   bool revLong = InpEnableReversals && longTrendRev && bullScore >= 3 && volOkRev;
   bool revShort = InpEnableReversals && shortTrendRev && bearScore >= 3 && volOkRev;

   double minSweep = atr * InpMinSweepAtr;
   bool liqSweepDn = (g_lastPivotLow != EMPTY_VALUE) && Lo < g_lastPivotLow &&
                     Cl > h[si - 1] && (h[si - 1] - Lo) > minSweep;
   bool liqSweepUp = (g_lastPivotHigh != EMPTY_VALUE) && Hi > g_lastPivotHigh &&
                     Cl < l[si - 1] && (Hi - l[si - 1]) > minSweep;

   string idealAct = "WAIT";
   if(InpUseIdeal)
     {
      if(liqSweepDn && Cl > ema100 && volOk) idealAct = "BUY";
      else if(bullBoSRetest && tema > lsma && volOk) idealAct = "BUY";
      else if((zone == "EO" || zone == "OS") && Cl > ema100 && tema > lsma && volOk) idealAct = "BUY";

      if(bearBoSRetest && tema < lsma && volOk) idealAct = "SELL";
      else if(lowerHigh && (zone == "OB" || zone == "EOB") && tema < lsma) idealAct = "SELL";
      else if(g_ema100TestCnt >= InpMaxTestCount && Cl < ema100 && tema < lsma &&
              Cl < ema100 && c[si - 1] >= ema100_s2)
         idealAct = "SELL";
     }

   string instAct = "WAIT";
   double instPct = InpInstBasePct;
   if(dynBuyLo <= Cl && Cl <= dynBuyHi)
     {
      instAct = "ACCUM";
      if(InpInstScale && dynRangeW > 0)
         instPct = InpInstBasePct * (1.0 + (dynBuyHi - Cl) / dynRangeW);
     }
   else if(dynSellLo <= Cl && Cl <= dynSellHi)
     {
      instAct = "DIST";
      if(InpInstScale && dynRangeW > 0)
         instPct = InpInstBasePct * (1.0 + (Cl - dynSellLo) / dynRangeW);
     }
   else if(dynMidLo <= Cl && Cl <= dynMidHi)
      instAct = "MID";

   bool instLong = InpUseInstitutional && instAct == "ACCUM";
   bool instShort = InpUseInstitutional && instAct == "DIST";

   bool davinSell = InpUseDavin && Cl > davin2 && HasPos(1) &&
                    (!InpDavinLowerClose || Cl < l[si - 1]);
   double davinStopDist = (HasPos(1)) ? ((PosEntry() - Cl) / Cl) : 0.0;
   bool davinStop = HasPos(1) && davinStopDist > 0.15;

   double trailOff = atr * InpTrailAtrMult;

   if(HasPos(1))
     {
      double ep = PosEntry();
      int bite = BarsSinceEntry();
      bool instE = (g_entrySig == SRC_INST);
      double sl0 = instE ? ep - InpSlAtrMult * 1.5 * atr : ep - InpSlAtrMult * atr;
      double tp0 = instE ? ep + InpTpAtrMult * 1.2 * atr : ep + InpTpAtrMult * atr;
      g_runTrailPeak = MathMax(g_runTrailPeak, Hi);
      double trailStop = g_runTrailPeak - trailOff;
      double stopPx = MathMax(sl0, trailStop);
      bool exit = false;
      if(Lo <= stopPx) exit = true;
      else if(Hi >= tp0) exit = true;
      else if(bite >= InpMaxBarsInTrade) exit = true;
      else if(InpUseDavin && (davinSell || davinStop)) exit = true;
      if(exit)
        {
         ClosePos();
         g_runTrailPeak = 0.0;
         g_entrySig = SRC_NONE;
        }
     }
   else if(HasPos(-1))
     {
      double ep = PosEntry();
      int bite = BarsSinceEntry();
      bool instE = (g_entrySig == SRC_INST);
      double sl0 = instE ? ep + InpSlAtrMult * 1.5 * atr : ep + InpSlAtrMult * atr;
      double tp0 = instE ? ep - InpTpAtrMult * 1.2 * atr : ep - InpTpAtrMult * atr;
      if(g_runTrailLo == EMPTY_VALUE) g_runTrailLo = Lo;
      else g_runTrailLo = MathMin(g_runTrailLo, Lo);
      double trailStop = g_runTrailLo + trailOff;
      double stopPx = MathMin(sl0, trailStop);
      bool exit = false;
      if(Hi >= stopPx) exit = true;
      else if(Lo <= tp0) exit = true;
      else if(bite >= InpMaxBarsInTrade) exit = true;
      if(exit)
        {
         ClosePos();
         g_runTrailLo = EMPTY_VALUE;
         g_entrySig = SRC_NONE;
        }
     }

   bool flat = !HasPos(0);

   bool davinBuy = false;
   if(InpUseDavin)
      davinBuy = (Cl > davin1 && Cl < davin2 && flat) ||
                 (flat && InpDavinBuyDip && davinOv > InpDavinDipTrig);

   bool origLong = false;
   bool origShort = false;
   if(InpUseTrendExhaust)
     {
      origLong = (longAllowed && temaXUp && volOk) ||
                 (trendExhausted && !g_trendBull && temaXUp && volOk);
      origShort = (shortAllowed && temaXDn && volOk) ||
                  (trendExhausted && g_trendBull && temaXDn && volOk);
     }
   else
     {
      origLong = longAllowed && temaXUp && volOk;
      origShort = shortAllowed && temaXDn && volOk;
     }

   const bool skipInst = (!InpUseInstitutional) || (InpEntryOrder == UTL_ORDER_SKIP_INST);
   const bool instL = (!skipInst) && instLong && flat;
   const bool instS = (!skipInst) && instShort && flat;
   const bool idealL = InpUseIdeal && idealAct == "BUY" && flat;
   const bool idealS = InpUseIdeal && idealAct == "SELL" && flat;
   const bool revL = revLong && flat;
   const bool revS = revShort && flat;
   const bool davL = InpUseDavin && davinBuy && flat;

   bool wantLong = false;
   bool wantShort = false;
   SigSource src = SRC_NONE;

   if(InpEntryOrder == UTL_ORDER_IDEAL_FIRST)
     {
      if(idealL)
        {
         wantLong = true;
         src = SRC_IDEAL;
        }
      else if(idealS)
        {
         wantShort = true;
         src = SRC_IDEAL;
        }
      else if(revL)
        {
         wantLong = true;
         src = SRC_REV;
        }
      else if(revS)
        {
         wantShort = true;
         src = SRC_REV;
        }
      else if(davL)
        {
         wantLong = true;
         src = SRC_DAVIN;
        }
      else if(instL)
        {
         wantLong = true;
         src = SRC_INST;
        }
      else if(instS)
        {
         wantShort = true;
         src = SRC_INST;
        }
      else if(origLong || origShort)
        {
         wantLong = origLong;
         wantShort = origShort;
         src = SRC_ORIG;
        }
     }
   else
     {
      // UTL_ORDER_PINE or UTL_ORDER_SKIP_INST (inst branch skipped via instL/instS false)
      if(instL)
        {
         wantLong = true;
         src = SRC_INST;
        }
      else if(instS)
        {
         wantShort = true;
         src = SRC_INST;
        }
      else if(idealL)
        {
         wantLong = true;
         src = SRC_IDEAL;
        }
      else if(idealS)
        {
         wantShort = true;
         src = SRC_IDEAL;
        }
      else if(revL)
        {
         wantLong = true;
         src = SRC_REV;
        }
      else if(revS)
        {
         wantShort = true;
         src = SRC_REV;
        }
      else if(davL)
        {
         wantLong = true;
         src = SRC_DAVIN;
        }
      else if(origLong || origShort)
        {
         wantLong = origLong;
         wantShort = origShort;
         src = SRC_ORIG;
        }
     }

   if(InpRiskDailyKillPct > 0.0)
     {
      static datetime day0 = 0;
      static double eq0 = 0.0;
      MqlDateTime now;
      TimeToStruct(TimeCurrent(), now);
      datetime midnight = StringToTime(StringFormat("%04d.%02d.%02d", now.year, now.mon, now.day));
      if(midnight != day0)
        {
         day0 = midnight;
         eq0 = AccountInfoDouble(ACCOUNT_EQUITY);
        }
      double dd = (eq0 > 0) ? (eq0 - AccountInfoDouble(ACCOUNT_EQUITY)) / eq0 * 100.0 : 0.0;
      if(dd >= InpRiskDailyKillPct && HasPos(0))
        {
         ClosePos();
         return;
        }
     }

   if(!flat) return;
   if(InpOnlyOnePosition && HasPos(0)) return;

   double pct = InpPctOther;
   if(src == SRC_INST) pct = instPct;
   else if(src == SRC_IDEAL) pct = InpPctIdeal;
   else if(src == SRC_REV) pct = InpPctRev;

   double lots = LotsFromPct(pct);
   if(lots <= 0) return;

   double ask = SymbolInfoDouble(g_sym, SYMBOL_ASK);
   double bid = SymbolInfoDouble(g_sym, SYMBOL_BID);

   bool instF = (src == SRC_INST);
   double slDist = instF ? InpSlAtrMult * 1.5 * atr : InpSlAtrMult * atr;
   double tpDist = instF ? InpTpAtrMult * 1.2 * atr : InpTpAtrMult * atr;

   if(wantLong)
     {
      double sl = ask - slDist;
      double tp = ask + tpDist;
      if(!ClampStopsForMarket(true, sl, tp))
        {
         Print("UTL BUY: stops invalid after clamp (stops_level?). ask=", ask, " sl=", sl, " tp=", tp);
        }
      else if(Trade.Buy(lots, g_sym, 0.0, sl, tp, "UTL"))
        {
         g_entrySig = src;
         g_runTrailPeak = Hi;
         g_runTrailLo = EMPTY_VALUE;
         if(InpJournalEntries)
            Print(TimeToString(bt[si]), " BUY src=", (int)src, " lots=", lots);
        }
      else
         Print("UTL BUY failed ret=", Trade.ResultRetcode(), " ", Trade.ResultRetcodeDescription(),
               " lots=", lots, " sl=", sl, " tp=", tp);
     }
   else if(wantShort)
     {
      double sl = bid + slDist;
      double tp = bid - tpDist;
      if(!ClampStopsForMarket(false, sl, tp))
        {
         Print("UTL SELL: stops invalid after clamp (stops_level?). bid=", bid, " sl=", sl, " tp=", tp);
        }
      else if(Trade.Sell(lots, g_sym, 0.0, sl, tp, "UTL"))
        {
         g_entrySig = src;
         g_runTrailLo = Lo;
         g_runTrailPeak = 0.0;
         if(InpJournalEntries)
            Print(TimeToString(bt[si]), " SELL src=", (int)src, " lots=", lots);
        }
      else
         Print("UTL SELL failed ret=", Trade.ResultRetcode(), " ", Trade.ResultRetcodeDescription(),
               " lots=", lots, " sl=", sl, " tp=", tp);
     }
  }

//+------------------------------------------------------------------+
