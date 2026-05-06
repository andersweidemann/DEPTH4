#!/bin/bash
# Install the whale-tracker launchd jobs for the current user.
#
#   discover: every 5 min (RunAtLoad=true so it fires immediately)
#   score   : every 6 hours
#
# Logs: data/logs/discover.log, data/logs/score.log, data/logs/launchd.*.{out,err}

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCH_DIR="$HOME/Library/LaunchAgents"
TEMPLATE_DIR="$PROJECT_DIR/launchd"

mkdir -p "$LAUNCH_DIR"
mkdir -p "$PROJECT_DIR/data/logs"

if [[ ! -x "$PROJECT_DIR/.venv/bin/whales" ]]; then
    echo "ERROR: $PROJECT_DIR/.venv/bin/whales not found."
    echo "Create the venv and install the package first:"
    echo "    python3 -m venv .venv && source .venv/bin/activate && pip install -e ."
    exit 1
fi

install_plist () {
    local name="$1"
    local tpl="$TEMPLATE_DIR/$name.plist.tpl"
    local dst="$LAUNCH_DIR/$name.plist"

    if [[ ! -f "$tpl" ]]; then
        echo "ERROR: template $tpl missing"
        exit 1
    fi

    # Substitute __PROJECT_DIR__ with the absolute project path.
    # Use a literal replacement (not sed regex) to be safe with spaces.
    python3 -c "
import sys, pathlib
tpl = pathlib.Path(sys.argv[1]).read_text()
out = tpl.replace('__PROJECT_DIR__', sys.argv[2])
pathlib.Path(sys.argv[3]).write_text(out)
" "$tpl" "$PROJECT_DIR" "$dst"

    # Unload first if it's already registered (idempotent).
    launchctl unload "$dst" 2>/dev/null || true
    launchctl load -w "$dst"
    echo "  loaded $dst"
}

echo "Installing launchd jobs for:"
echo "  PROJECT_DIR = $PROJECT_DIR"
echo

install_plist "com.whales.discover"
install_plist "com.whales.score"

echo
echo "Done. Useful commands:"
echo "  launchctl list | grep whales"
echo "  tail -f $PROJECT_DIR/data/logs/discover.log"
echo "  tail -f $PROJECT_DIR/data/logs/score.log"
echo "  $PROJECT_DIR/.venv/bin/whales stats"
echo
echo "To uninstall: $PROJECT_DIR/scripts/uninstall_launchd.sh"
