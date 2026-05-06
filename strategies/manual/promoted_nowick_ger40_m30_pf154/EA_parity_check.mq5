//+------------------------------------------------------------------+
//| EA_parity_check.mq5 — bar-close signal dump (no orders).        |
//| Writes CSV: time,regime,signal,sl,tp,size  (size=0 placeholder) |
//| Open Data Folder → MQL5 → Files → factory_nowick_parity.csv       |
//+------------------------------------------------------------------+
#property copyright "TRADING"
#property version   "1.00"
#property strict

input string            InpSymbol   = "";
input ENUM_TIMEFRAMES   InpTF       = PERIOD_M30;
input datetime          InpDateFrom = D'2020.01.01 00:00';
input datetime          InpDateTo   = D'2024.06.30 23:59';

int g_hATR = INVALID_HANDLE;
int g_hEf  = INVALID_HANDLE;
int g_hEs  = INVALID_HANDLE;
int g_hEfH1 = INVALID_HANDLE;
int g_hEsH1 = INVALID_HANDLE;

datetime g_lastBar = 0;
int      g_file = INVALID_HANDLE;

string Sym() { return(InpSymbol == "" ? _Symbol : InpSymbol); }

// --- minimal copies of EA signal helpers (keep in sync with EA.mq5) ---
input int    InpMaxWaitBars = 48;
input bool   InpWickStrict  = true;
input double InpWickEps     = 0.55;
input double InpWickAtol   = 1e-9;
input int    InpTrendFast  = 50;
input int    InpTrendSlow  = 200;
input bool   InpUseH1      = true;
input double InpTpR        = 3.4;
input double InpSlBufPts   = 2.5;
input double InpPbAtr      = 0.35;
input int    InpAtrP       = 14;
input bool   InpVolOn      = true;
input double InpApLo       = 5.0;
input double InpApHi       = 92.0;
input int    InpApLb      = 500;
input double InpPtModel   = 0.1;
input int    InpBerlinMin = 0;
input int    InpSess0     = 9 * 60 + 30;
input int    InpSess1     = 18 * 60;

double WickTol() { double t = SymbolInfoDouble(Sym(), SYMBOL_POINT); return(MathMax(t * InpWickAtol, 1e-15)); }
bool WBull(const MqlRates &r, const double pt)
  {
   if(InpWickStrict) return(MathAbs(r.open - r.low) <= WickTol() && r.close > r.open);
   return(MathAbs(r.open - r.low) <= pt * InpWickEps && r.close > r.open);
  }
bool WBear(const MqlRates &r, const double pt)
  {
   if(InpWickStrict) return(MathAbs(r.open - r.high) <= WickTol() && r.close < r.open);
   return(MathAbs(r.open - r.high) <= pt * InpWickEps && r.close < r.open);
  }

double Atr(const int sh) { double b[]; if(CopyBuffer(g_hATR, 0, sh, 1, b) < 1) return(0); return(b[0]); }

double AtrPct(const int sh, const int tot)
  {
   double a0 = Atr(sh);
   if(a0 <= 0) return(50);
   int last = (int)MathMin(sh + InpApLb, tot - 1);
   int c = 0, n = 0;
   for(int i = sh; i <= last; i++) { double a = Atr(i); if(a <= 0) continue; n++; if(a <= a0) c++; }
   if(n < 5) return(50);
   return(100.0 * c / n);
  }

bool TrM30(const int sh, const bool L)
  {
   double bf[], bs[], cl[];
   if(CopyBuffer(g_hEf, 0, sh, 1, bf) < 1 || CopyBuffer(g_hEs, 0, sh, 1, bs) < 1) return(false);
   if(CopyClose(Sym(), InpTF, sh, 1, cl) < 1) return(false);
   if(L) return(bf[0] > bs[0] && cl[0] > bs[0]);
   return(bf[0] < bs[0] && cl[0] < bs[0]);
  }

bool TrH1(const datetime tb, const bool L)
  {
   int sh = iBarShift(Sym(), PERIOD_H1, tb, false);
   if(sh < 0) return(false);
   double bf[], bs[], cl[];
   if(CopyBuffer(g_hEfH1, 0, sh, 1, bf) < 1 || CopyBuffer(g_hEsH1, 0, sh, 1, bs) < 1) return(false);
   if(CopyClose(Sym(), PERIOD_H1, sh, 1, cl) < 1) return(false);
   if(L) return(bf[0] > bs[0] && cl[0] > bs[0]);
   return(bf[0] < bs[0] && cl[0] < bs[0]);
  }

bool SessOk(const datetime t)
  {
   MqlDateTime st;
   TimeToStruct(t + InpBerlinMin * 60, st);
   int m = st.hour * 60 + st.min;
   return(m >= InpSess0 && m < InpSess1);
  }

int EvalSig(const MqlRates &rt[], const int n, const int entrySh, double &sl, double &tp)
  {
   sl = tp = 0.0;
   if(entrySh < 1) return(0);
   double pt = InpPtModel > 0 ? InpPtModel : SymbolInfoDouble(Sym(), SYMBOL_POINT);
   if(!SessOk(rt[entrySh].time)) return(0);
   for(int age = 1; age <= InpMaxWaitBars; age++)
     {
      int sig = entrySh + age;
      if(sig >= n - 1) break;
      if(!WBull(rt[sig], pt)) continue;
      double hi = rt[sig].high;
      if(hi <= rt[sig].low) continue;
      double ai = Atr(sig);
      double thr = hi - InpPbAtr * ai;
      bool pull = false;
      for(int k = sig - 1; k >= entrySh + 1; k--) if(rt[k].low < thr) { pull = true; break; }
      if(!pull) continue;
      if(!(rt[entrySh].low <= hi && rt[entrySh].high >= hi)) continue;
      if(InpVolOn) { double ap = AtrPct(entrySh, n); if(ap < InpApLo || ap > InpApHi) continue; }
      if(!(InpUseH1 ? TrH1(rt[entrySh].time, true) : TrM30(entrySh, true))) continue;
      double buf = InpSlBufPts * pt;
      double seg = rt[sig].low;
      for(int u = sig - 1; u >= entrySh; u--) seg = MathMin(seg, rt[u].low);
      double slp = seg - buf;
      if(slp >= hi - 1e-9) continue;
      double oneR = hi - slp;
      if(oneR <= 1e-9) continue;
      sl = slp;
      tp = hi + InpTpR * oneR;
      return(1);
     }
   return(0);
  }

int OnInit()
  {
   string s = Sym();
   g_hATR = iATR(s, InpTF, InpAtrP);
   g_hEf = iMA(s, InpTF, InpTrendFast, 0, MODE_EMA, PRICE_CLOSE);
   g_hEs = iMA(s, InpTF, InpTrendSlow, 0, MODE_EMA, PRICE_CLOSE);
   g_hEfH1 = iMA(s, PERIOD_H1, InpTrendFast, 0, MODE_EMA, PRICE_CLOSE);
   g_hEsH1 = iMA(s, PERIOD_H1, InpTrendSlow, 0, MODE_EMA, PRICE_CLOSE);
   g_file = FileOpen("factory_nowick_parity.csv", FILE_WRITE | FILE_CSV | FILE_COMMON, ',');
   if(g_file != INVALID_HANDLE) FileWrite(g_file, "time", "regime", "signal", "sl", "tp", "size");
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int r)
  {
   if(g_file != INVALID_HANDLE) FileClose(g_file);
   if(g_hATR != INVALID_HANDLE) IndicatorRelease(g_hATR);
   if(g_hEf != INVALID_HANDLE) IndicatorRelease(g_hEf);
   if(g_hEs != INVALID_HANDLE) IndicatorRelease(g_hEs);
   if(g_hEfH1 != INVALID_HANDLE) IndicatorRelease(g_hEfH1);
   if(g_hEsH1 != INVALID_HANDLE) IndicatorRelease(g_hEsH1);
  }

void OnTick()
  {
   MqlRates rt[];
   ArraySetAsSeries(rt, true);
   int n = CopyRates(Sym(), InpTF, 0, 50000, rt);
   if(n < 300) return;
   if(rt[0].time == g_lastBar) return;
   g_lastBar = rt[0].time;
   datetime t1 = rt[1].time;
   if(t1 < InpDateFrom || t1 > InpDateTo) return;
   double sl = 0, tp = 0;
   int sig = EvalSig(rt, n, 1, sl, tp);
   if(g_file == INVALID_HANDLE) return;
   FileWrite(g_file, TimeToString(t1, TIME_DATE | TIME_MINUTES), 1, sig, sl, tp, 0.0);
  }
