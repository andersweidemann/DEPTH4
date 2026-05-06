#!/bin/bash
# Run a single discover pass. Called by launchd every 5 min.
# Accumulates wallets into the local SQLite cache so we build up a real
# universe over time (Polymarket caps /trades pagination at ~3000 offset).

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

LOG_DIR="$PROJECT_DIR/data/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/discover.log"

# Rotate log if it gets over 10MB (keep last 5 MB roughly).
if [[ -f "$LOG" ]] && [[ $(stat -f%z "$LOG" 2>/dev/null || echo 0) -gt 10485760 ]]; then
    tail -c 5242880 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

{
    echo "=== $(date -u +'%Y-%m-%dT%H:%M:%SZ') discover tick ==="
    "$PROJECT_DIR/.venv/bin/whales" discover --pages 10 || echo "discover failed: $?"
} >> "$LOG" 2>&1
