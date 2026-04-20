//+------------------------------------------------------------------+
//|                                                     Signals.mqh  |
//| Parity with agents/signals.py. Keep function signatures mirrored.|
//+------------------------------------------------------------------+
#property strict

#ifndef __FACTORY_SIGNALS_MQH__
#define __FACTORY_SIGNALS_MQH__

#include <Indicators/Indicators.mqh>

// All functions operate on `symbol` / `tf` and a shift (0 = current bar).
// They wrap iCustom/iATR/etc. so strategies can stay declarative.

double SigSMA(const string symbol, const ENUM_TIMEFRAMES tf, const int period, const int shift)
{
   return(iMA(symbol, tf, period, 0, MODE_SMA, PRICE_CLOSE, shift));
}

double SigEMA(const string symbol, const ENUM_TIMEFRAMES tf, const int period, const int shift)
{
   return(iMA(symbol, tf, period, 0, MODE_EMA, PRICE_CLOSE, shift));
}

double SigATR(const string symbol, const ENUM_TIMEFRAMES tf, const int period, const int shift)
{
   int h = iATR(symbol, tf, period);
   if(h == INVALID_HANDLE) return(0.0);
   double buf[];
   if(CopyBuffer(h, 0, shift, 1, buf) <= 0) return(0.0);
   return(buf[0]);
}

double SigRSI(const string symbol, const ENUM_TIMEFRAMES tf, const int period, const int shift)
{
   return(iRSI(symbol, tf, period, PRICE_CLOSE, shift));
}

void SigBollinger(const string symbol, const ENUM_TIMEFRAMES tf, const int period,
                  const double mult, const int shift,
                  double &upper, double &middle, double &lower)
{
   middle = iMA(symbol, tf, period, 0, MODE_SMA, PRICE_CLOSE, shift);
   int h = iStdDev(symbol, tf, period, 0, MODE_SMA, PRICE_CLOSE);
   double sd[];
   double stdev = 0.0;
   if(h != INVALID_HANDLE && CopyBuffer(h, 0, shift, 1, sd) > 0) stdev = sd[0];
   upper = middle + mult * stdev;
   lower = middle - mult * stdev;
}

double SigBBWidth(const string symbol, const ENUM_TIMEFRAMES tf, const int period,
                  const double mult, const int shift)
{
   double u, m, l;
   SigBollinger(symbol, tf, period, mult, shift, u, m, l);
   if(m == 0.0) return(0.0);
   return((u - l) / m);
}

// Prior-bar Donchian (shifted by 1 to match Python: no lookahead).
void SigDonchian(const string symbol, const ENUM_TIMEFRAMES tf, const int period,
                 const int shift, double &upper, double &lower)
{
   int idxHigh = iHighest(symbol, tf, MODE_HIGH, period, shift + 1);
   int idxLow  = iLowest(symbol, tf, MODE_LOW,  period, shift + 1);
   upper = (idxHigh < 0) ? 0.0 : iHigh(symbol, tf, idxHigh);
   lower = (idxLow  < 0) ? 0.0 : iLow (symbol, tf, idxLow );
}

// ATR breakout levels: prior close +/- mult*ATR.
void SigATRBreakoutLevels(const string symbol, const ENUM_TIMEFRAMES tf,
                          const int atrPeriod, const double mult, const int shift,
                          double &upper, double &lower)
{
   double atrVal = SigATR(symbol, tf, atrPeriod, shift + 1);
   double priorClose = iClose(symbol, tf, shift + 1);
   upper = priorClose + mult * atrVal;
   lower = priorClose - mult * atrVal;
}

// Returns true if current bar's hour-of-day (UTC of server) is within any range.
// `sessions` is flattened pairs: {s0,e0,s1,e1,...}, pass count of pairs as sessionsCount.
bool SigSessionMask(const string symbol, const ENUM_TIMEFRAMES tf, const int shift,
                    const int &sessions[], const int sessionsCount)
{
   datetime t = iTime(symbol, tf, shift);
   MqlDateTime st;
   TimeToStruct(t, st);
   int h = st.hour;
   for(int i = 0; i < sessionsCount; i++)
   {
      int s = sessions[i * 2 + 0];
      int e = sessions[i * 2 + 1];
      if(s <= e)
      {
         if(h >= s && h < e) return(true);
      }
      else
      {
         if(h >= s || h < e) return(true);
      }
   }
   return(false);
}

#endif
