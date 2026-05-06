//+------------------------------------------------------------------+
//|                                                     Regime.mqh   |
//| Parity with agents/regime.py.                                    |
//+------------------------------------------------------------------+
#property strict

#ifndef __FACTORY_REGIME_MQH__
#define __FACTORY_REGIME_MQH__

#include "Signals.mqh"

enum ENUM_FACTORY_REGIME { REG_TREND, REG_RANGE, REG_VOLATILE, REG_QUIET };

double RegADX(const string symbol, const ENUM_TIMEFRAMES tf, const int period, const int shift)
{
   int h = iADX(symbol, tf, period);
   if(h == INVALID_HANDLE) return(0.0);
   double buf[];
   if(CopyBuffer(h, 0, shift, 1, buf) <= 0) return(0.0);
   return(buf[0]);
}

// ATR percentile over `lookback` bars ending at `shift`. Returns value in [0,1].
double RegATRPercentile(const string symbol, const ENUM_TIMEFRAMES tf,
                        const int atrPeriod, const int lookback, const int shift)
{
   if(lookback < 2) return(0.5);
   double cur = SigATR(symbol, tf, atrPeriod, shift);
   int below = 0;
   int counted = 0;
   for(int i = 1; i <= lookback; i++)
   {
      double v = SigATR(symbol, tf, atrPeriod, shift + i);
      if(v <= 0.0) continue;
      if(v <= cur) below++;
      counted++;
   }
   if(counted == 0) return(0.5);
   return((double)below / (double)counted);
}

ENUM_FACTORY_REGIME RegClassify(const string symbol, const ENUM_TIMEFRAMES tf,
                                const int adxPeriod, const int atrPeriod,
                                const int atrLookback, const int shift,
                                const double adxTrendMin = 25.0,
                                const double atrVolHi   = 0.8,
                                const double atrQuietLo = 0.2)
{
   double adx = RegADX(symbol, tf, adxPeriod, shift);
   double pct = RegATRPercentile(symbol, tf, atrPeriod, atrLookback, shift);
   if(adx >= adxTrendMin) return(REG_TREND);
   if(pct >= atrVolHi)    return(REG_VOLATILE);
   if(pct <= atrQuietLo)  return(REG_QUIET);
   return(REG_RANGE);
}

string RegName(const ENUM_FACTORY_REGIME r)
{
   switch(r)
   {
      case REG_TREND:    return("TREND");
      case REG_RANGE:    return("RANGE");
      case REG_VOLATILE: return("VOLATILE");
      case REG_QUIET:    return("QUIET");
   }
   return("RANGE");
}

#endif
