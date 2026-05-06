#!/bin/bash
# Re-score all known wallets. Called by launchd every 6 hours.
# Only wallets with >=3 cached trades are scored; scoring one wallet costs
# ~10 API calls so we cap concurrency at 8 to stay well under the 30 req/s
# Data API limit.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

LOG_DIR="$PROJECT_DIR/data/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/score.log"

if [[ -f "$LOG" ]] && [[ $(stat -f%z "$LOG" 2>/dev/null || echo 0) -gt 10485760 ]]; then
    tail -c 5242880 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

# Cap max wallets per run to keep each run bounded (~15 min max at 8 concurrency).
MAX_WALLETS="${WHALES_SCORE_MAX:-2000}"

{
    echo "=== $(date -u +'%Y-%m-%dT%H:%M:%SZ') score tick (max=$MAX_WALLETS) ==="
    "$PROJECT_DIR/.venv/bin/whales" score \
        --min-trades 3 \
        --max-wallets "$MAX_WALLETS" \
        --concurrency 8 || echo "score failed: $?"
} >> "$LOG" 2>&1
