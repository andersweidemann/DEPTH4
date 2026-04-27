from __future__ import annotations

import asyncio
from collections.abc import Sequence

import yfinance as yf

from signal_api.config import get_settings


def _fetch_all(
  tickers: list[str],
) -> dict[str, dict[str, float]]:
  s = get_settings()
  try:
    fxp = yf.Ticker(s.yahoo_fx_ticker)
    fxh = fxp.history(period="5d")
    sek_per_usd = float(fxh["Close"].iloc[-1]) if len(fxh) else 11.0
  except Exception:
    sek_per_usd = 11.0
  out: dict[str, dict[str, float]] = {}
  for t in tickers:
    try:
      tick = yf.Ticker(t)
      hist = tick.history(period="5d", interval="1d")
      if hist.empty or len(hist) == 0:
        continue
      last = float(hist["Close"].iloc[-1])
      cur = "USD"
      if isinstance(getattr(tick, "info", None), dict):
        cur = str(tick.info.get("currency") or "USD")
      if cur == "SEK":
        sek = last
      elif cur == "USD":
        sek = last * sek_per_usd
      else:
        try:
          c = yf.Ticker(f"{cur}USD=X").history(period="5d")
          rate = float(c["Close"].iloc[-1]) if len(c) else 1.0
        except Exception:
          rate = 1.0
        sek = last * rate * sek_per_usd
      out[t] = {"price": last, "price_sek": sek}
    except Exception:
      continue
  return out


async def quote_tickers(
  tickers: Sequence[str],
) -> dict[str, dict[str, float]]:
  u = list({t.upper() for t in tickers if t and str(t).strip()})
  if not u:
    return {}
  return await asyncio.to_thread(_fetch_all, u)
