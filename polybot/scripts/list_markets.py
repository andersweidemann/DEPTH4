#!/usr/bin/env python3
"""Print the top active markets by volume. Read-only, no auth."""
from polybot.config import get_settings
from polybot.data import MarketData

if __name__ == "__main__":
    s = get_settings()
    d = MarketData(s)
    try:
        for m in d.list_active_markets(limit=25):
            print(f"{m.condition_id}  {m.question[:80]}  (accepting={m.accepting_orders})")
    finally:
        d.close()
