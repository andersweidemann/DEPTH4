//+------------------------------------------------------------------+
//|                                                      Risk.mqh    |
//| Parity with agents/risk.py. Enforces equity sizing, daily kill   |
//| switch, and spread filter. The Risk Officer static check fails   |
//| any EA that doesn't reference RiskLotsByPct / RiskDailyKillOK.   |
//+------------------------------------------------------------------+
#property strict

#ifndef __FACTORY_RISK_MQH__
#define __FACTORY_RISK_MQH__

// Compute lot size so that hitting SL loses riskPct% of equity.
// slPoints is the SL distance in points (= price distance / _Point).
double RiskLotsByPct(const string symbol, const double riskPct, const double slPoints)
{
   if(slPoints <= 0.0 || riskPct <= 0.0) return(0.0);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double tickValue = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize  = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
   double point     = SymbolInfoDouble(symbol, SYMBOL_POINT);
   if(tickValue <= 0.0 || tickSize <= 0.0 || point <= 0.0) return(0.0);

   double riskCash = equity * riskPct / 100.0;
   double lossPerLot = slPoints * point / tickSize * tickValue;
   if(lossPerLot <= 0.0) return(0.0);

   double lots = riskCash / lossPerLot;

   double minLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   double step   = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   if(step > 0.0) lots = MathFloor(lots / step) * step;
   lots = MathMax(minLot, MathMin(maxLot, lots));
   return(NormalizeDouble(lots, 2));
}

// Per-symbol daily drawdown tracker.
struct FactoryKillState
{
   datetime current_day;
   double   start_of_day_equity;
   bool     killed;
};

void RiskKillReset(FactoryKillState &s)
{
   s.current_day = 0;
   s.start_of_day_equity = 0.0;
   s.killed = false;
}

bool RiskDailyKillOK(FactoryKillState &s, const double maxDDPct)
{
   datetime now = TimeCurrent();
   MqlDateTime st; TimeToStruct(now, st);
   st.hour = 0; st.min = 0; st.sec = 0;
   datetime today = StructToTime(st);
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);

   if(s.current_day != today)
   {
      s.current_day = today;
      s.start_of_day_equity = eq;
      s.killed = false;
   }
   if(s.killed) return(false);
   if(s.start_of_day_equity <= 0.0) return(true);
   double dd = (s.start_of_day_equity - eq) / s.start_of_day_equity * 100.0;
   if(dd >= maxDDPct)
   {
      s.killed = true;
      return(false);
   }
   return(true);
}

bool RiskSpreadOK(const string symbol, const double maxPoints)
{
   double spread = (double)SymbolInfoInteger(symbol, SYMBOL_SPREAD);
   return(spread <= maxPoints);
}

#endif
