<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.whales.discover</string>

    <key>ProgramArguments</key>
    <array>
        <string>__PROJECT_DIR__/scripts/discover_tick.sh</string>
    </array>

    <key>StartInterval</key>
    <integer>300</integer>

    <key>RunAtLoad</key>
    <true/>

    <key>WorkingDirectory</key>
    <string>__PROJECT_DIR__</string>

    <key>StandardOutPath</key>
    <string>__PROJECT_DIR__/data/logs/launchd.discover.out</string>

    <key>StandardErrorPath</key>
    <string>__PROJECT_DIR__/data/logs/launchd.discover.err</string>

    <key>ThrottleInterval</key>
    <integer>60</integer>

    <key>ProcessType</key>
    <string>Background</string>

    <key>LowPriorityIO</key>
    <true/>
</dict>
</plist>
