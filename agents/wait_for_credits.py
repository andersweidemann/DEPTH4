"""Polls the Anthropic API until it stops returning 'credit balance too low'.

Meant to be run in the background while the user tweaks billing / workspace
settings in the console. Exits 0 on first successful call, logging the response.
"""
from __future__ import annotations

import sys
import time

from agents import config  # triggers dotenv load
from agents.llm_client import complete, LLMError


INTERVAL_S = 120
MAX_ATTEMPTS = 60  # 2h total


def main() -> int:
    for i in range(1, MAX_ATTEMPTS + 1):
        ts = time.strftime("%H:%M:%S")
        try:
            resp = complete(
                system="Respond with exactly one word.",
                user="Say pong.",
                max_tokens=10,
                temperature=0,
            )
            print(f"[{ts}] attempt {i}: API OK -> {resp!r}", flush=True)
            return 0
        except LLMError as e:
            msg = str(e)
            short = msg[:160].replace("\n", " ")
            print(f"[{ts}] attempt {i}: still blocked -> {short}", flush=True)
            time.sleep(INTERVAL_S)
    print(f"gave up after {MAX_ATTEMPTS} attempts", flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(main())
