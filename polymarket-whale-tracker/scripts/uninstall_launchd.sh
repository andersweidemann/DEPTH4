#!/bin/bash
# Unload and delete the whale-tracker launchd jobs.
set -euo pipefail

LAUNCH_DIR="$HOME/Library/LaunchAgents"

for name in com.whales.discover com.whales.score; do
    plist="$LAUNCH_DIR/$name.plist"
    if [[ -f "$plist" ]]; then
        launchctl unload "$plist" 2>/dev/null || true
        rm -f "$plist"
        echo "  removed $plist"
    else
        echo "  (not installed) $plist"
    fi
done

echo "Done. The local SQLite cache is untouched."
