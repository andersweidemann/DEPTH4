#!/usr/bin/env python3
"""Convenience entry point: `python scripts/run_bot.py`.

Equivalent to `polybot run` once the package is installed.
"""
from polybot.runner import Runner

if __name__ == "__main__":
    Runner().run_forever()
