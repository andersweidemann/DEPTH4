#!/usr/bin/env bash
# Run the MT5 EA agent factory (agents.run_loop) from repo root.
# Usage:
#   ./scripts/factory_loop.sh              # 50 generations, no early stop
#   ./scripts/factory_loop.sh 20 --stop-on-accept
#   ./scripts/factory_loop.sh 25 --config config/campaigns/ger40_m15.discovery.yaml
#   TRADING_CONFIG_OVERLAY=config/campaigns/xauusd_m15.strict.yaml ./scripts/factory_loop.sh 15 --stop-on-accept
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
GENS="${1:-50}"
shift || true
exec ./.venv/bin/python -m agents.run_loop --gens "$GENS" "$@"
